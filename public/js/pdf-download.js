(function () {
  const NORMAL_WAIT_SECONDS = 5;       // "Download PDF" (browser print dialog)
  const COMPATIBLE_WAIT_SECONDS = 12;  // "Download PDF compatible" (server-made PDF)

  const style = document.createElement("style");
  style.textContent =
    ".pdf-download-spinner{display:inline-block;width:16px;height:16px;margin-right:8px;" +
    "vertical-align:-3px;border:2px solid currentColor;border-right-color:transparent;" +
    "border-radius:50%;animation:pdf-download-spin .7s linear infinite}" +
    "@keyframes pdf-download-spin{to{transform:rotate(360deg)}}" +
    ".pm-btn:disabled,.btn:disabled{opacity:.75;cursor:wait}";
  document.head.appendChild(style);

  async function createPdf(pages, filename) {
    const response = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages, filename })
    });
    if (!response.ok) {
      throw new Error((await response.text()) || "Could not generate the PDF.");
    }

    return response.blob();
  }

  async function createPdfDownload(pages, filename) {
    const pdf = await createPdf(pages, filename);
    return () => {
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };
  }

  function openTransferDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("pdfcreate-file-transfer", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("files", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open PDF transfer storage."));
    });
  }

  async function savePdfTransfer(file) {
    const id = crypto.randomUUID();
    const db = await openTransferDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put({ id, name: file.name, file });
      tx.oncomplete = () => { db.close(); resolve(id); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not save the PDF for editing.")); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("Could not save the PDF for editing.")); };
    });
  }

  async function getPdfTransfer(id) {
    const db = await openTransferDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readonly");
      const request = tx.objectStore("files").get(id);
      let record;
      request.onsuccess = () => { record = request.result; };
      tx.oncomplete = () => { db.close(); resolve(record || null); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not read the transferred PDF.")); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("Could not read the transferred PDF.")); };
    });
  }

  async function removePdfTransfer(id) {
    const db = await openTransferDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not clear the transferred PDF.")); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("Could not clear the transferred PDF.")); };
    });
  }

  function showDelayedLoading(message, delay = 1500) {
    let overlay;
    const timer = setTimeout(() => {
      overlay = document.createElement("div");
      overlay.className = "pdf-loading-overlay";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML =
        '<span class="pdf-loading-spinner" aria-hidden="true"></span>' +
        `<span>${message}</span>`;
      document.body.appendChild(overlay);
    }, delay);

    return () => {
      clearTimeout(timer);
      overlay?.remove();
    };
  }

  const loadingStyle = document.createElement("style");
  loadingStyle.textContent =
    ".pdf-loading-overlay{position:fixed;inset:0;z-index:20000;display:flex;flex-direction:column;" +
    "align-items:center;justify-content:center;gap:14px;background:rgba(15,18,35,.72);color:#fff;" +
    "font:600 1rem/1.4 system-ui,sans-serif}" +
    ".pdf-loading-spinner{width:42px;height:42px;border:4px solid rgba(255,255,255,.35);" +
    "border-top-color:#fff;border-radius:50%;animation:pdf-loading-spin .75s linear infinite}" +
    "@keyframes pdf-loading-spin{to{transform:rotate(360deg)}}" +
    "@media(prefers-reduced-motion:reduce){.pdf-loading-spinner{animation:none}}";
  document.head.appendChild(loadingStyle);

  async function withCountdown(button, action, seconds = NORMAL_WAIT_SECONDS) {
    if (button.disabled) return false;
    const originalContent = button.innerHTML;
    // Lock the other download button(s) in the same modal while this one is working.
    const siblings = Array.from(
      button.parentElement ? button.parentElement.querySelectorAll("[data-pdf-dl]") : []
    ).filter((el) => el !== button && !el.disabled);
    siblings.forEach((el) => { el.disabled = true; });
    button.disabled = true;

    let downloadError;
    let startDownload;
    const downloadTask = Promise.resolve()
      .then(action)
      .then((callback) => {
        startDownload = callback;
      })
      .catch((error) => {
        downloadError = error;
      });

    for (let left = seconds; left > 0; left--) {
      button.innerHTML =
        `<span class="pdf-download-spinner" aria-hidden="true"></span>` +
        `Preparing PDF (${left}s)`;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    button.innerHTML =
      '<span class="pdf-download-spinner" aria-hidden="true"></span>Creating PDF…';
    await downloadTask;
    try {
      if (!downloadError && typeof startDownload === "function") startDownload();
    } catch (error) {
      downloadError = error;
    } finally {
      button.innerHTML = originalContent;
      button.disabled = false;
      siblings.forEach((el) => { el.disabled = false; });
    }

    if (!downloadError) return true;

    console.error("PDF download failed:", downloadError);
    if (window.Swal) {
      await window.Swal.fire({
        icon: "error",
        title: "Download failed",
        text: downloadError.message || "Could not generate the PDF."
      });
    } else {
      window.alert(downloadError.message || "Could not generate the PDF.");
    }
    return false;
  }

  /* ---------- Normal download: opens the browser's own print dialog ---------- */

  function escapeAttribute(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  // Same hidden "source" text the server adds, so a PDF saved from the print dialog
  // can still be opened in the Edit Text tool. Skipped if the browser can't gzip.
  async function addHiddenPayload(pages) {
    if (typeof CompressionStream === "undefined") return pages;
    try {
      const stream = new Blob([JSON.stringify(pages)]).stream().pipeThrough(new CompressionStream("gzip"));
      const gz = new Uint8Array(await new Response(stream).arrayBuffer());
      const payload = "g" + bytesToBase64(gz);
      const sliceSize = Math.ceil(payload.length / pages.length);
      return pages.map((html, index) => {
        const slice = payload.slice(index * sliceSize, (index + 1) * sliceSize);
        const hidden =
          '<div aria-hidden="true" style="position:fixed;left:0;bottom:0;width:100%;max-height:400px;' +
          "overflow:hidden;margin:0;padding:0;font:2px/2px monospace;word-break:break-all;" +
          'color:rgba(0,0,0,0.01);pointer-events:none;user-select:none">' +
          `HW1${index}.${pages.length}.${slice.length}:${slice}</div>`;
        const bodyEnd = /<\/body\s*>/i;
        return bodyEnd.test(html) ? html.replace(bodyEnd, `${hidden}</body>`) : `${html}${hidden}`;
      });
    } catch (error) {
      console.warn("Could not embed editable source:", error);
      return pages;
    }
  }

  function createPrintDocument(pages) {
    const frames = pages
      .map(
        (html) =>
          `<iframe title="PDF page" scrolling="no" srcdoc="${escapeAttribute(
            `<style>html,body{overflow:hidden!important}::-webkit-scrollbar{display:none}</style>${html}`
          )}"></iframe>`
      )
      .join("");

    return `<!doctype html>
    <html><head><meta charset="utf-8"><style>
      @page{size:A4;margin:0}
      html,body{margin:0;padding:0;width:210mm;background:#fff}
      iframe{display:block;width:210mm;height:296.5mm;border:0;background:#fff;break-after:page;page-break-after:always}
      iframe:last-child{break-after:auto;page-break-after:auto}
    </style></head><body>${frames}</body></html>`;
  }

  function makeHiddenFrame() {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none";
    return frame;
  }

  function waitForFrameLoad(frame) {
    return new Promise((resolve) => {
      frame.addEventListener("load", () => resolve(), { once: true });
    });
  }

  // Builds the print frame in the background and returns a function that opens the print dialog.
  function openPrintWhenReady(frame) {
    return () => {
      const win = frame.contentWindow;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        setTimeout(() => frame.remove(), 500);
      };
      win.addEventListener("afterprint", cleanup, { once: true });
      setTimeout(cleanup, 10 * 60 * 1000);
      win.focus();
      win.print();
    };
  }

  async function createPrintAction(pages) {
    const list = await addHiddenPayload(pages);
    const frame = makeHiddenFrame();
    const loaded = waitForFrameLoad(frame);
    frame.srcdoc = createPrintDocument(list);
    document.body.appendChild(frame);
    await loaded;
    // wait for each nested page frame, then fonts, so the print preview is complete
    const nested = Array.from(frame.contentDocument.querySelectorAll("iframe"));
    await Promise.all(
      nested.map((inner) =>
        inner.contentDocument && inner.contentDocument.readyState === "complete"
          ? null
          : waitForFrameLoad(inner)
      )
    );
    try { await frame.contentDocument.fonts.ready; } catch (e) {}
    await Promise.all(
      nested.map((inner) => {
        try { return inner.contentDocument.fonts.ready; } catch (e) { return null; }
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    return openPrintWhenReady(frame);
  }

  // For an already-made PDF file (Blob): load it in a hidden frame and print it.
  async function createBlobPrintAction(blob) {
    const url = URL.createObjectURL(blob);
    const frame = makeHiddenFrame();
    const loaded = waitForFrameLoad(frame);
    frame.src = url;
    document.body.appendChild(frame);
    await loaded;
    await new Promise((resolve) => setTimeout(resolve, 800));
    const print = openPrintWhenReady(frame);
    return () => {
      print();
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    };
  }

  // Normal button: 5s countdown, then the browser's print dialog.
  function downloadNormal(button, source) {
    return withCountdown(
      button,
      () => {
        if (source instanceof Blob) return createBlobPrintAction(source);
        const pages = source || window.preparedPdfPages;
        if (!Array.isArray(pages) || pages.length === 0) {
          throw new Error("No prepared PDF is available to print.");
        }
        return createPrintAction(pages);
      },
      NORMAL_WAIT_SECONDS
    );
  }

  // Compatible button: 12s countdown, then the PDF made by the server downloads directly.
  // `action` must return (a promise of) a function that starts the download.
  function downloadCompatible(button, action) {
    return withCountdown(button, action, COMPATIBLE_WAIT_SECONDS);
  }

  window.pdfCreateDownload = {
    async prepare(pages) {
      const pageList = typeof pages === "string" ? [pages] : pages;
      if (!Array.isArray(pageList) || pageList.length === 0) {
        throw new Error("No pages are available to export.");
      }
      window.lastGeneratedPages = pageList.slice();
      window.preparedPdfPages = pageList.slice();
    },
    discard() {
      window.preparedPdfPages = null;
    },
    createPdf,
    downloadPrepared(filename) {
      if (!window.preparedPdfPages?.length) {
        throw new Error("No prepared PDF is available to download.");
      }
      return createPdfDownload(window.preparedPdfPages, filename);
    },
    downloadPages: createPdfDownload,
    savePdfTransfer,
    getPdfTransfer,
    removePdfTransfer,
    showDelayedLoading,
    withCountdown,
    downloadNormal,
    downloadCompatible,
    NORMAL_WAIT_SECONDS,
    COMPATIBLE_WAIT_SECONDS
  };
})();
