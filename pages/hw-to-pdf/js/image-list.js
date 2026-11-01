/* =========================================================
   image-list.js – the list of selected images
   - add images (file picker or drag & drop, max MAX_IMAGES)
   - draw the list with slide-in / slide-out animations
   - click a thumbnail to preview it (image-preview.js)
   - drag the handle to reorder the images (image-sort.js)
   ========================================================= */

// Every selected image is stored as:
// { file: File, previewUrl: string, isNew: boolean, isRemoving: boolean }
let selectedImages = [];

// SVG markup for the circled ✕ remove icon
const CLOSE_ICON_SVG =
  '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">' +
  '<circle cx="20" cy="20" r="17"/><path d="M12 12l16 16M28 12L12 28"/></svg>';

// Adds images from the file picker or from drag & drop
function addImages(newFiles) {
  for (const file of newFiles) {
    // Ignore anything that is not an image
    if (!file.type.startsWith("image/")) continue;

    // Stop when the limit is reached
    if (selectedImages.length >= MAX_IMAGES) {
      Alert.fire({
        icon: "warning",
        title: "Limit reached",
        text: "You can select a maximum of " + MAX_IMAGES + " images."
      });
      break;
    }

    selectedImages.push({
      file,
      previewUrl: URL.createObjectURL(file), // temporary URL used for the thumbnail
      isNew: true,                           // lets renderImageList() play the slide-in animation
      isRemoving: false                      // true while the slide-out animation runs
    });
  }
  renderImageList();
}

// Removes an image with a right-to-left sliding animation
function removeImage(image, listItem) {
  // Ignore repeated clicks while the animation is already running
  if (image.isRemoving) return;
  image.isRemoving = true;

  // Lock the current height so CSS can transition it down to 0
  listItem.style.height = listItem.offsetHeight + "px";

  // Force the browser to apply the height before adding the class
  void listItem.offsetHeight;

  // Adding this class triggers: slide to the left -> fade -> collapse
  listItem.classList.add("removing");

  // After the animation finishes, remove the image from the data and the DOM
  setTimeout(() => {
    URL.revokeObjectURL(image.previewUrl);                         // free the thumbnail memory
    selectedImages = selectedImages.filter((x) => x !== image);    // remove by reference (index-safe)
    renderImageList();
  }, REMOVE_ANIMATION_MS);
}

// Builds one card (<li>) for an image
function createImageListItem(image) {
  const listItem = document.createElement("li");
  listItem.className = "file-item";

  // Slide-in animation only for newly added images
  if (image.isNew) {
    listItem.classList.add("enter");
    image.isNew = false; // so it doesn't replay on the next render
  }

  // If a re-render happens mid-removal, keep it in the removing state
  if (image.isRemoving) listItem.classList.add("removing");

  listItem._image = image; // lets image-sort.js read the new order from the DOM

  const thumbnail = document.createElement("img");
  thumbnail.className = "thumb";
  thumbnail.src = image.previewUrl;
  thumbnail.alt = image.file.name;
  thumbnail.draggable = false; // stop the browser's own image drag
  thumbnail.tabIndex = 0;
  thumbnail.setAttribute("role", "button");
  thumbnail.setAttribute("aria-label", "Preview " + image.file.name);
  thumbnail.addEventListener("click", () => openImagePreview(image));
  thumbnail.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openImagePreview(image);
    }
  });

  const fileName = document.createElement("p");
  fileName.className = "file-name";
  fileName.textContent = image.file.name;

  const removeButton = document.createElement("button");
  removeButton.className = "remove-btn";
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", "Remove " + image.file.name);
  removeButton.innerHTML = CLOSE_ICON_SVG;
  removeButton.addEventListener("click", () => removeImage(image, listItem));

  listItem.append(thumbnail, fileName);

  // Drag handle: only useful when there is more than one image to reorder
  if (selectedImages.length > 1) {
    listItem.append(createDragHandle(image, listItem));
  }

  listItem.append(removeButton);
  return listItem;
}

// Draws the whole list of selected images
function renderImageList() {
  imageListElement.innerHTML = ""; // clear the old list

  // Placeholder text when nothing is selected
  if (selectedImages.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.className = "empty-msg";
    emptyMessage.textContent = "No images selected yet";
    imageListElement.appendChild(emptyMessage);
  }

  selectedImages.forEach((image) => {
    imageListElement.appendChild(createImageListItem(image));
  });

  // "Convert to PDF" is disabled until at least one image is selected
  convertButton.disabled = selectedImages.length === 0;
}

// ---------- Events: file picker + drag & drop ----------
function setupImagePickerEvents() {
  // Files chosen through the file picker
  fileInput.addEventListener("change", () => {
    addImages(fileInput.files);
    fileInput.value = ""; // reset so the same file can be picked again
  });

  // Highlight the dropzone while a file is dragged over it
  ["dragenter", "dragover"].forEach((eventName) =>
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );

  // Remove the highlight when the drag leaves or the file is dropped
  ["dragleave", "drop"].forEach((eventName) =>
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );

  // Files dropped onto the dropzone
  dropzone.addEventListener("drop", (e) => addImages(e.dataTransfer.files));
}
