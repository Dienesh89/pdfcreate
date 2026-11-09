(function () {
  const DELAY_MS = 5000;

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

  async function withCountdown(button, action) {
    if (button.disabled) return false;
    const originalContent = button.innerHTML;
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

    for (let seconds = 5; seconds > 0; seconds--) {
      button.innerHTML =
        `<span class="pdf-download-spinner" aria-hidden="true"></span>` +
        `Preparing PDF (${seconds}s)`;
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS / 5));
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
    }

    if (!downloadError) return true;

    if (downloadError) {
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
    }
    return false;
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
    withCountdown
  };
})();
