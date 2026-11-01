/* =========================================================
   main.js – app start-up: connects every part together
   (loaded last, after all other scripts)
   ========================================================= */

let isConversionRunning = false; // ignores double taps on "Convert to PDF"

// "Convert to PDF": the user must be signed in with Puter first (the popup opens right here,
// inside the click, so the browser allows it), then the conversion runs
convertButton.addEventListener("click", async () => {
  if (isConversionRunning) return;
  isConversionRunning = true;

  try {
    const signedIn = await ensurePuterSignedIn();
    if (!signedIn) return;

    const images = [...selectedImages]; // snapshot: the list can't change during the run
    if (images.length === 0) return;

    // start fresh on every click (otherwise old entries pile up)
    imageProcessingInfo.length = 0;
    for (let i = 0; i < images.length; i++) {
      imageProcessingInfo.push({
        isCompressed: false,
        isUploaded: false,
        isConverted: ["nothing"]
      });
    }
    showModal(imageProcessingInfo.length);
    await convertImagesToPdf(images);
  } finally {
    isConversionRunning = false;
  }
});

setupPuterAuthEvents();
setupImagePickerEvents();
refreshAuthUi();     // show the sign-in card, or the "Sign out" button if already signed in
renderImageList();   // initial draw
