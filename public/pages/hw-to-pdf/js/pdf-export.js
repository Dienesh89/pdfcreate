async function preparePdfPages(pages) {
  await window.pdfCreateDownload.prepare(pages);
}

function downloadPreparedPdf() {
  return window.pdfCreateDownload.downloadPrepared("handwritten-notes");
}

function discardPreparedPdf() {
  window.pdfCreateDownload.discard();
}
