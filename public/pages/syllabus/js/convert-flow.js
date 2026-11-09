/* =========================================================
   convert-flow.js – the full "Create Syllabus PDF" pipeline
   handwritten images -> compressed images -> Puter AI (header + subject rows)
   -> syllabus_template layout (header on page 1 only) -> one PDF
   ========================================================= */

// True when the text holds a long run of numbers that go up by exactly 1 (e.g. "6, 7, 8, ... 40").
// A real syllabus rarely lists more than ~10 consecutive chapters; the model sometimes keeps counting by itself.
const hasRunawayNumbers = (html = "") => {
  const text = html.replace(/<[^>]*>/g, " ");
  for (const match of text.matchAll(/\d+(?:\s*[,،]\s*\d+){11,}/g)) {
    const numbers = match[0].split(/\s*[,،]\s*/).map(Number);
    let run = 1;
    for (let k = 1; k < numbers.length; k++) {
      run = numbers[k] === numbers[k - 1] + 1 ? run + 1 : 1;
      if (run >= 12) return true;
    }
  }
  return false;
};

async function convertImagesToPdf(images) {
  try {
    const preparedImages = await prepareImagesForAi(images);
    const conversion = await convertImagesToHtml(preparedImages, {
      getPrompt: getConversionPrompt,
      looksWrong: hasRunawayNumbers,   // the model sometimes keeps counting "6, 7, 8 ..." by itself
      retryNote: RUNAWAY_RETRY_NOTE
    });
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

    // Build the syllabus from the template (header only on page 1, taken from image 1)
    const syllabusPages = await buildSyllabusPages(rawPages);
    if (syllabusPages.length === 0) {
      dismissModal();
      await Alert.fire({
        icon: "error",
        title: "No syllabus found",
        text: "Could not find any subjects in the uploaded images. Try clearer photos."
      });
      return;
    }

    // Some images missing (rate limit / failed image) -> tell the user, still save the rest
    if (convertedCount < conversion.total) {
      dismissModal(); // the alert must be visible above the popup
      const headerNote = rawPages[0] ? "" : " The first image failed, so the syllabus has no header.";
      await Alert.fire({
        icon: "warning",
        title: "Partial syllabus",
        text: `${convertedCount} of ${conversion.total} images were read. ${conversion.message}${headerNote}`
      });
    }

    // The model kept repeating a number list even after a retry -> ask the user to check before sharing
    if (conversion.suspicious && conversion.suspicious.length) {
      dismissModal();
      await Alert.fire({
        icon: "warning",
        title: "Please check the syllabus",
        text: `Image ${conversion.suspicious.join(", ")}: some chapter/page numbers look wrong (a long number list was repeated). Please check the PDF carefully, or try a clearer photo.`
      });
    }

    await preparePdfPages(syllabusPages); // build the hidden A4 pages (nothing is shown yet)
    // Popup switches to "PDF ready" with a Download PDF button (the tap starts the print / save)
    showDownloadModal(syllabusPages.length, downloadPreparedPdf, discardPreparedPdf);
  } catch (err) {
    console.error(err);
    dismissModal();
    Alert.fire({ icon: "error", title: "Error", text: err.message || "Something went wrong." });
  }
}
