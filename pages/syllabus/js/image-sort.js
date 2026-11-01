/* =========================================================
   image-sort.js – drag & drop reordering of the image list
   - drag the handle (mouse, touch or pen) to move a card
   - keyboard: focus the handle and press ArrowUp / ArrowDown
   - the page order used for the PDF is selectedImages[]
   ========================================================= */

// SVG markup for the six-dot grip icon
const GRIP_ICON_SVG =
  '<svg viewBox="0 0 24 40" fill="currentColor" aria-hidden="true">' +
  '<circle cx="8" cy="12" r="2.4"/><circle cx="16" cy="12" r="2.4"/>' +
  '<circle cx="8" cy="20" r="2.4"/><circle cx="16" cy="20" r="2.4"/>' +
  '<circle cx="8" cy="28" r="2.4"/><circle cx="16" cy="28" r="2.4"/></svg>';

const SETTLE_ANIMATION_MS = 200; // how long cards take to glide into place

// Builds the handle button for one card
function createDragHandle(image, listItem) {
  const handle = document.createElement("button");
  handle.className = "drag-handle";
  handle.type = "button";
  handle.innerHTML = GRIP_ICON_SVG;
  handle.setAttribute("aria-label", "Reorder " + image.file.name + " (drag, or use arrow up / down)");

  // Mouse / touch / pen
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // left button only
    e.preventDefault();
    startDrag(e, handle, listItem);
  });

  // Keyboard
  handle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    moveImageByKeyboard(image, e.key === "ArrowUp" ? -1 : 1);
  });

  return handle;
}

// Moves an image one step up (-1) or down (+1) and keeps focus on its handle
function moveImageByKeyboard(image, step) {
  const from = selectedImages.indexOf(image);
  const to = from + step;
  if (from < 0 || to < 0 || to >= selectedImages.length) return;

  selectedImages.splice(to, 0, selectedImages.splice(from, 1)[0]);
  renderImageList();

  for (const item of imageListElement.children) {
    if (item._image === image) item.querySelector(".drag-handle")?.focus();
  }
}

// The cards that can currently be reordered (ignores the placeholder and cards being removed)
const isSortable = (el) =>
  el && el.classList.contains("file-item") && !el.classList.contains("removing");

function startDrag(e, handle, item) {
  const pointerId = e.pointerId;
  handle.setPointerCapture(pointerId);

  let lastClientY = e.clientY;
  let startPageY = e.clientY + window.scrollY; // pointer position the card is anchored to
  let frameId = 0;

  item.classList.add("dragging");
  document.body.classList.add("is-sorting");

  const nextSortable = () => {
    let el = item.nextElementSibling;
    while (el && !isSortable(el)) el = el.nextElementSibling;
    return el;
  };
  const previousSortable = () => {
    let el = item.previousElementSibling;
    while (el && !isSortable(el)) el = el.previousElementSibling;
    return el;
  };

  // Layout-based centre (offsetTop ignores transforms, so animations can't confuse it)
  const centerOf = (el, extraOffset = 0) => el.offsetTop + extraOffset + el.offsetHeight / 2;

  // Swaps the dragged card with a neighbour and keeps it under the pointer
  function swapWith(sibling, placeAfter) {
    const siblingTopBefore = sibling.getBoundingClientRect().top;
    const itemLayoutTopBefore = item.offsetTop;

    if (placeAfter) sibling.after(item);
    else sibling.before(item);

    // The card's layout position jumped; shift the anchor so it doesn't visually jump
    startPageY += item.offsetTop - itemLayoutTopBefore;

    // Neighbour glides from its old position to its new one (FLIP)
    const shift = siblingTopBefore - sibling.getBoundingClientRect().top;
    sibling.style.transition = "none";
    sibling.style.transform = "translateY(" + shift + "px)";
    void sibling.offsetHeight;
    sibling.style.transition = "transform " + SETTLE_ANIMATION_MS + "ms ease";
    sibling.style.transform = "";
    setTimeout(() => (sibling.style.transition = ""), SETTLE_ANIMATION_MS + 30);
  }

  // Runs every frame while dragging: follow the pointer, swap places, auto-scroll
  function frame() {
    const edge = 70;  // px from the screen edge where auto-scroll starts
    const speed = 14; // px per frame
    if (lastClientY < edge) window.scrollBy(0, -speed);
    else if (lastClientY > window.innerHeight - edge) window.scrollBy(0, speed);

    const dy = lastClientY + window.scrollY - startPageY;
    item.style.transform = "translateY(" + dy + "px) scale(1.02)";

    const draggedCenter = centerOf(item, dy);
    const next = nextSortable();
    const previous = previousSortable();
    if (next && draggedCenter > centerOf(next)) swapWith(next, true);
    else if (previous && draggedCenter < centerOf(previous)) swapWith(previous, false);

    frameId = requestAnimationFrame(frame);
  }

  const onMove = (ev) => { lastClientY = ev.clientY; };

  function finish() {
    cancelAnimationFrame(frameId);
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);

    // Glide the card into its final slot
    item.classList.remove("dragging");
    item.style.transition = "transform " + SETTLE_ANIMATION_MS + "ms ease";
    item.style.transform = "";
    setTimeout(() => (item.style.transition = ""), SETTLE_ANIMATION_MS + 30);
    document.body.classList.remove("is-sorting");

    // Save the new order: read it back from the DOM
    selectedImages = [...imageListElement.children]
      .filter((el) => el._image)
      .map((el) => el._image);
  }

  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  frameId = requestAnimationFrame(frame);
}
