/* =========================================================
   image-preview.js – full-size preview of a selected image
   - opens when a thumbnail is clicked
   - close: ✕ button, click outside the image, or Esc
   - ← / → (or the arrow buttons) browse the other images
   ========================================================= */

let previewOverlay = null;   // built the first time it is needed
let previewImageElement = null;
let previewCaption = null;
let previewPrevButton = null;
let previewNextButton = null;
let previewIndex = -1;
let previewOpener = null;    // element to give focus back to on close

const PREVIEW_ARROW_LEFT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const PREVIEW_ARROW_RIGHT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';

function buildPreviewOverlay() {
  previewOverlay = document.createElement("div");
  previewOverlay.className = "ip-overlay";
  previewOverlay.setAttribute("role", "dialog");
  previewOverlay.setAttribute("aria-modal", "true");
  previewOverlay.setAttribute("aria-label", "Image preview");

  const closeButton = document.createElement("button");
  closeButton.className = "ip-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close preview");
  closeButton.innerHTML = CLOSE_ICON_SVG; // same icon as the remove button
  closeButton.addEventListener("click", closeImagePreview);

  previewPrevButton = document.createElement("button");
  previewPrevButton.className = "ip-nav ip-prev";
  previewPrevButton.type = "button";
  previewPrevButton.setAttribute("aria-label", "Previous image");
  previewPrevButton.innerHTML = PREVIEW_ARROW_LEFT_SVG;
  previewPrevButton.addEventListener("click", () => showPreviewAt(previewIndex - 1));

  previewNextButton = document.createElement("button");
  previewNextButton.className = "ip-nav ip-next";
  previewNextButton.type = "button";
  previewNextButton.setAttribute("aria-label", "Next image");
  previewNextButton.innerHTML = PREVIEW_ARROW_RIGHT_SVG;
  previewNextButton.addEventListener("click", () => showPreviewAt(previewIndex + 1));

  const figure = document.createElement("figure");
  figure.className = "ip-figure";
  previewImageElement = document.createElement("img");
  previewImageElement.className = "ip-img";
  previewImageElement.draggable = false;
  previewCaption = document.createElement("figcaption");
  previewCaption.className = "ip-caption";
  figure.append(previewImageElement, previewCaption);

  previewOverlay.append(closeButton, previewPrevButton, figure, previewNextButton);

  // Click on the dark area (not on the image) closes the preview
  previewOverlay.addEventListener("click", (e) => {
    if (e.target === previewOverlay || e.target === figure) closeImagePreview();
  });

  document.body.appendChild(previewOverlay);
}

// Shows the image at `index` inside the open preview
function showPreviewAt(index) {
  if (index < 0 || index >= selectedImages.length) return;
  previewIndex = index;
  const image = selectedImages[index];

  previewImageElement.src = image.previewUrl;
  previewImageElement.alt = image.file.name;
  previewCaption.textContent =
    image.file.name + (selectedImages.length > 1 ? "  ·  " + (index + 1) + " / " + selectedImages.length : "");

  previewPrevButton.hidden = index === 0;
  previewNextButton.hidden = index === selectedImages.length - 1;
}

function openImagePreview(image) {
  const index = selectedImages.indexOf(image);
  if (index < 0) return;
  if (!previewOverlay) buildPreviewOverlay();

  previewOpener = document.activeElement;
  showPreviewAt(index);

  // Hide the arrows entirely when there is only one image
  previewPrevButton.style.display = previewNextButton.style.display =
    selectedImages.length > 1 ? "" : "none";

  document.body.style.overflow = "hidden"; // stop the page scrolling behind the preview
  previewOverlay.classList.add("open");
  previewOverlay.querySelector(".ip-close").focus();
  document.addEventListener("keydown", onPreviewKeydown);
}

function closeImagePreview() {
  if (!previewOverlay || !previewOverlay.classList.contains("open")) return;
  previewOverlay.classList.remove("open");
  document.body.style.overflow = "";
  document.removeEventListener("keydown", onPreviewKeydown);
  if (previewOpener && previewOpener.focus) previewOpener.focus();
}

function onPreviewKeydown(e) {
  if (e.key === "Escape") closeImagePreview();
  else if (e.key === "ArrowLeft") showPreviewAt(previewIndex - 1);
  else if (e.key === "ArrowRight") showPreviewAt(previewIndex + 1);
}
