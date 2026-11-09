/* =========================================================
   convert-flow.js – the full "Create Exam Paper PDF" pipeline
   handwritten images -> compressed images -> Puter AI (header + question blocks)
   -> exam_template layout (header on page 1 only) -> one PDF
   ========================================================= */

async function convertImagesToPdf(images) {
  try {
    const preparedImages = await prepareImagesForAi(images);
    const conversion = await convertImagesToHtml(preparedImages, { getPrompt: getConversionPrompt });
    console.log(conversion);

    // One entry per image, in order (null = that image failed). Index 0 = header source.
    const rawPages = conversion.pages;
    const convertedCount = rawPages.filter(Boolean).length;

    if (convertedCount === 0) {
      dismissModal();
      await Alert.fire({
        icon: "error",
        title: "Conversion failed",
        text: conversion.message || "No image could be read."
      });
      return;
    }

    // Build the exam paper from the template (header only on page 1, taken from image 1)
    const examPages = await buildExamPages(rawPages);
    if (examPages.length === 0) {
      dismissModal();
      await Alert.fire({
        icon: "error",
        title: "No questions found",
        text: "Could not find any questions in the uploaded images. Try clearer photos."
      });
      return;
    }

    // Some images missing (rate limit / failed image) -> tell the user, still save the rest
    if (convertedCount < conversion.total) {
      dismissModal(); // the alert must be visible above the popup
      const headerNote = rawPages[0] ? "" : " The first image failed, so the paper has no header.";
      await Alert.fire({
        icon: "warning",
        title: "Partial exam paper",
        text: `${convertedCount} of ${conversion.total} images were read. ${conversion.message}${headerNote}`
      });
    }

    await preparePdfPages(examPages); // build the hidden A4 pages (nothing is shown yet)
    // Popup switches to "PDF ready" with a Download PDF button (the tap starts the print / save)
    showDownloadModal(examPages.length, downloadPreparedPdf, discardPreparedPdf);
  } catch (err) {
    console.error(err);
    dismissModal();
    Alert.fire({ icon: "error", title: "Error", text: err.message || "Something went wrong." });
  }
}
