/* =========================================================
   PDF Create – editor session (client side only)
   Keeps the LAST opened PDF, and every edit made on it, in this browser
   (IndexedDB) so a refresh / closed tab / crash does not lose the work.
   Nothing is sent to a server.

   Records (one per editor, so each editor remembers its own last PDF):
     "text"       -> Edit PDF Text      { pages, current, name }
     "full"       -> Edit Other Things  { fileId, name, cur, snapshot }
     "full-file"  -> Edit Other Things  { fileId, name, blob }  (the original PDF)
   ========================================================= */
(function () {
  "use strict";

  const DB_NAME = "pdfcreate-editor-session";
  const STORE = "sessions";
  let dbPromise = null;
  let warned = false;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(new Error("IndexedDB is not available")); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error("Could not open storage"));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  // Runs fn(store) in one transaction; resolves when the transaction has committed.
  async function run(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result;
      fn(tx.objectStore(STORE), (v) => { result = v; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("Storage error"));
      tx.onabort = () => reject(tx.error || new Error("Storage aborted"));
    });
  }

  /* ---------- small "toast" (no dependency on SweetAlert) ---------- */
  function notify(text) {
    try {
      const old = document.getElementById("pdfEditorSessionToast");
      if (old) old.remove();
      const d = document.createElement("div");
      d.id = "pdfEditorSessionToast";
      d.setAttribute("role", "status");
      d.textContent = text;
      d.style.cssText =
        "position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:30000;" +
        "background:#1f2547;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px/1.3 system-ui,sans-serif;" +
        "box-shadow:0 6px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center";
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 2800);
    } catch (e) { /* ignore */ }
  }

  /* ---------- public API ---------- */
  // save(record | [records])  -> Promise<boolean>   (never rejects)
  async function save(records) {
    const list = Array.isArray(records) ? records : [records];
    try {
      await run("readwrite", (store) => list.forEach((r) => store.put(r)));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      return true;
    } catch (err) {
      console.warn("PDF Create: could not auto-save", err);
      if (!warned) {
        warned = true;
        notify("Could not auto-save your work in this browser (storage full or blocked).");
      }
      return false;
    }
  }

  // load(key) -> Promise<record | null>   (never rejects)
  async function load(key) {
    try {
      return (await run("readonly", (store, out) => {
        const req = store.get(key);
        req.onsuccess = () => out(req.result || null);
      })) || null;
    } catch (err) {
      console.warn("PDF Create: could not read the saved PDF", err);
      return null;
    }
  }

  // clear(key | [keys]) -> Promise<boolean>
  async function clear(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    try {
      await run("readwrite", (store) => list.forEach((k) => store.delete(k)));
      return true;
    } catch (err) {
      console.warn("PDF Create: could not clear the saved PDF", err);
      return false;
    }
  }

  // Runs fn when the page is hidden / closed / refreshed (last chance to save).
  function onLeave(fn) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") fn();
    });
    window.addEventListener("pagehide", fn);
  }

  // autosaver(fn, delay) -> { schedule(), flush() }   debounced + flushed on leave
  function autosaver(fn, delay) {
    let timer = null;
    const flush = () => { clearTimeout(timer); timer = null; fn(); };
    onLeave(() => { if (timer !== null) flush(); else fn(); });
    return {
      schedule() { clearTimeout(timer); timer = setTimeout(flush, delay || 600); },
      flush,
    };
  }

  function newId() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* ignore */ }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  window.pdfEditorSession = { save, load, clear, notify, onLeave, autosaver, newId };
})();
