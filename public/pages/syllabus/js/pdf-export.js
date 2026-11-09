async function preparePdfPages(pages) {
  await window.pdfCreateDownload.prepare(pages);
}

function downloadPreparedPdf() {
  return window.pdfCreateDownload.downloadPrepared("syllabus");
}

function discardPreparedPdf() {
  window.pdfCreateDownload.discard();
}
