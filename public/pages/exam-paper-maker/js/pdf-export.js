async function preparePdfPages(pages) {
  await window.pdfCreateDownload.prepare(pages);
}

function downloadPreparedPdf() {
  return window.pdfCreateDownload.downloadPrepared("exam-paper");
}

function discardPreparedPdf() {
  window.pdfCreateDownload.discard();
}
