/* =========================================================
   image-list.js – the list of selected images
   Same experience as Merge PDF (shared: ../../js/file-list.js + ../../css/file-list.css)
   - add images (file picker or drag & drop, max MAX_IMAGES)
   - small thumbnails (no full photo kept decoded in memory)
   - drag the grip (mouse or finger) or use the arrows to reorder
   - click a thumbnail to preview it (image-preview.js)
   ========================================================= */

// Every selected image is stored as:
// { id, file: File, previewUrl: string, thumb: HTMLCanvasElement | null }
let selectedImages = [];
let nextImageId = 0;

// SVG markup for the circled ✕ icon (also used by the preview's close button)
const CLOSE_ICON_SVG =
  '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">' +
  '<circle cx="20" cy="20" r="17"/><path d="M12 12l16 16M28 12L12 28"/></svg>';

// Adds images from the file picker or from drag & drop
function addImages(newFiles) {
  for (const file of [...newFiles]) {
    if (!file.type.startsWith("image/")) continue;

    if (selectedImages.length >= MAX_IMAGES) {
      Alert.fire({
        icon: "warning",
        title: "Limit reached",
        text: "You can select a maximum of " + MAX_IMAGES + " images."
      });
      break;
    }

    const image = {
      id: ++nextImageId,
      file,
      previewUrl: URL.createObjectURL(file), // only decoded when the preview is opened
      thumb: null
    };
    selectedImages.push(image);

    // Small thumbnail, drawn into the card as soon as it is ready
    PDFFileList.imageThumb(file, 96).then((canvas) => {
      if (!canvas || !selectedImages.includes(image)) return;
      image.thumb = canvas;
      const box = imageListElement.querySelector('[data-id="' + image.id + '"] .fl-thumb');
      if (box) { box.textContent = ""; box.appendChild(canvas); }
    });
  }
  renderImageList();
}

function releaseImage(image) {
  URL.revokeObjectURL(image.previewUrl);
  if (image.thumb) { image.thumb.width = image.thumb.height = 0; image.thumb = null; }
}

function removeImage(image) {
  releaseImage(image);
  selectedImages = selectedImages.filter((x) => x !== image);
  renderImageList();
}

function clearImages() {
  selectedImages.forEach(releaseImage);
  selectedImages = [];
  renderImageList();
}

function moveImage(image, step, keepFocus) {
  const from = selectedImages.indexOf(image);
  const to = from + step;
  if (from < 0 || to < 0 || to >= selectedImages.length) return;
  selectedImages.splice(to, 0, selectedImages.splice(from, 1)[0]);
  renderImageList();
  if (keepFocus) imageListElement.querySelector('[data-id="' + image.id + '"] .fl-handle')?.focus();
}

// Draws the whole list of selected images
function renderImageList() {
  imageListElement.innerHTML = "";
  const count = selectedImages.length;

  selectedImages.forEach((image, index) => {
    imageListElement.appendChild(
      PDFFileList.item({
        id: image.id,
        name: image.file.name,
        info: PDFFileList.fmtSize(image.file.size),
        thumb: image.thumb,
        fallback: "IMG",
        index,
        count,
        onThumb: () => openImagePreview(image),
        onUp: (kb) => moveImage(image, -1, kb),
        onDown: (kb) => moveImage(image, 1, kb),
        onRemove: () => removeImage(image)
      })
    );
  });

  const has = count > 0;
  listPanelElement.hidden = !has;
  actionBarElement.hidden = !has;
  emptyMessageElement.hidden = has;
  const totalBytes = selectedImages.reduce((sum, x) => sum + x.file.size, 0);
  summaryElement.textContent =
    count + (count === 1 ? " image" : " images") + " · " + PDFFileList.fmtSize(totalBytes);
  convertButton.disabled = !has;
}

// ---------- Events: file picker + drag & drop + reorder ----------
function setupImagePickerEvents() {
  PDFFileList.bindDrop(dropzone, fileInput, addImages);
  PDFFileList.enableSort(imageListElement, (ids) => {
    const byId = new Map(selectedImages.map((x) => [String(x.id), x]));
    selectedImages = ids.map((id) => byId.get(id)).filter(Boolean);
    renderImageList();
  });
  clearButton.addEventListener("click", clearImages);
}
