async function preparePdfPages(pages) {
  await window.pdfCreateDownload.prepare(pages);
}

function discardPreparedPdf() {
  window.pdfCreateDownload.discard();
}
