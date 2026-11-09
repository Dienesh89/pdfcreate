/* =========================================================
   convert-flow.js – the full "Convert to PDF" pipeline
   images -> compressed images -> Puter AI HTML pages -> one PDF
   ========================================================= */

async function convertImagesToPdf(images) {
  try {
    const preparedImages = await prepareImagesForAi(images);
    const conversion = await convertImagesToHtml(preparedImages);
    console.log(conversion);

    // Keep only the pages that were converted successfully (image order is preserved)
    const pages = conversion.pages.filter(Boolean);

    if (pages.length === 0) {
      dismissModal();
      await Alert.fire({
        icon: "error",
        title: "Conversion failed",
        text: conversion.message || "No page could be converted."
      });
      return;
    }

    // Some pages missing (rate limit / failed image) -> tell the user, still save the rest
    if (pages.length < conversion.total) {
      dismissModal(); // the alert must be visible above the popup
      await Alert.fire({
        icon: "warning",
        title: "Partial PDF",
        text: `${pages.length} of ${conversion.total} pages converted. ${conversion.message}`
      });
    }

    await preparePdfPages(pages); // build the hidden A4 pages (nothing is shown yet)
    // Popup switches to "PDF ready" with a Download PDF button (the tap starts the print / save)
    showDownloadModal(pages.length, downloadPreparedPdf, discardPreparedPdf);
  } catch (err) {
    console.error(err);
    dismissModal();
    Alert.fire({ icon: "error", title: "Error", text: err.message || "Something went wrong." });
  }
}
