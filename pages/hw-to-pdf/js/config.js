/* =========================================================
   config.js – every setting and constant in one place
   ========================================================= */

// ---------- Image picker ----------
const MAX_IMAGES = 3;               // maximum number of images the user can select
const REMOVE_ANIMATION_MS = 400;    // slide-out (350ms) + collapse (300ms) animation time

// (The AI connection - Puter sign-in, model list, retries - is shared by every page: ../../js/puter-ai.js)

// Shorter prompt = fewer input tokens
const CONVERSION_PROMPT = `Digitize ONLY the handwritten/hand-drawn content of this notebook page into one print-ready A4 HTML document.
Rules:
- Keep the exact layout, positions and structure; diagrams/figures as inline SVG.
- Black ink only, plain font (Roboto, sans-serif).
- Skip ruled/margin lines, date box, page-no box, paper background.
- Single self-contained HTML: <style> in <head>, "@page{size:A4;margin:0}", page sized 210mm x 297mm, overflow hidden.
Output raw HTML only: no code fences, no explanation.`;

// ---------- Image compression (used before the image goes to the AI) ----------
const IMAGE_MAX_SIZE_PX = 1536;      // longest side after compression
const IMAGE_JPEG_QUALITY = 0.85;
