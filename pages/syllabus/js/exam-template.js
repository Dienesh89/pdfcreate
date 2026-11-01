/* =========================================================
   exam-template.js – builds the final exam paper from the AI output
   - holds the exam template look (same CSS as exam_template.html)
   - takes the question blocks read from every image (in order)
   - header (school / term / class / subject / time / M.M) is used from the
     FIRST image only and is printed on page 1 only
   - fills A4 pages one after another (a question never starts at the
     very bottom of a page; a very long question is split across pages)
   Result: array of complete page HTML strings -> preparePdfPages()
   ========================================================= */

// Same styling as exam_template.html (only @page replaced by body padding)
const EXAM_CSS = `
* { box-sizing: border-box; }

  body {
    font-family: 'Verdana', 'Segoe UI', Arial, sans-serif;
    color: #111;
    font-size: 13.5px;
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }

  /* ---------- HEADER (title always centered; time/M.M pinned to
     the sides, both anchored to the bottom of the header block so
     they never move regardless of how many title lines you add) ---------- */
  .header-grid {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    column-gap: 10px;
  }

  .header-grid .time,
  .header-grid .mm {
    font-weight: 700;
    font-size: 14px;
    white-space: nowrap;
  }
  .header-grid .time { text-align: left; }
  .header-grid .mm   { text-align: right; }

  .header-grid .titles {
    text-align: center;
  }

  .school-name {
    font-size: 26px;
    font-weight: 700;
    margin: 0 0 2px 0;
  }

  .exam-title,
  .exam-class,
  .exam-subject {
    font-size: 17px;
    font-weight: 700;
    margin: 2px 0;
  }

  .double-rule {
    border: 0;
    border-top: 3px solid #000;
    margin: 8px 0 3px 0;
  }

  .single-rule {
    border: 0;
    border-top: 1.5px solid #000;
    margin: 0 0 10px 0;
  }

  .instructions {
    text-align: center;
    font-weight: 700;
    text-decoration: underline;
    margin: 4px 0 16px 0;
    font-size: 14px;
  }

  /* ---------- QUESTION BLOCK ---------- */
  .q-block {
    margin-bottom: 14px;
  }

  .q-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: 700;
    text-decoration: underline;
    font-size: 14px;
    margin-bottom: 6px;
  }

  .q-title { text-decoration: underline; }
  .q-marks { text-decoration: none; white-space: nowrap; margin-left: 10px; }

  .q-body {
    margin-left: 4px;
  }

  .q-item {
    margin: 5px 0;
  }

  /* ---------- MCQ / OPTIONS (2 per row) ---------- */
  .options-row {
    display: flex;
    margin: 3px 0 3px 22px;
    gap: 40px;
  }
  .options-row span { white-space: nowrap; }

  /* ---------- FILL IN THE BLANKS ---------- */
  .word-bank {
    font-weight: 400;
    text-decoration: none;
  }
  .blank {
    display: inline-block;
    min-width: 90px;
    border-bottom: 1px solid #000;
  }

  /* ---------- TRUE / FALSE ---------- */
  .tf-item {
    margin: 5px 0 5px 22px;
  }

  /* ---------- JUMBLED WORDS (2 columns) ---------- */
  .jumbled-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    row-gap: 5px;
    margin-left: 22px;
    max-width: 320px;
  }

  /* ---------- MATCH THE FOLLOWING ---------- */
  .match-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
  }
  .match-table td {
    padding: 10px 8px;
    vertical-align: middle;
    font-size: 13.5px;
  }
  .match-table td.icon-cell {
    width: 90px;
  }
  .icon-box {
    width: 64px;
    height: 46px;
    border: 1px solid #555;
    background: #eef0f3;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 16px;
    border-radius: 2px;
  }

  /* ---------- DIAGRAM / ANSWER SPACE ---------- */
  .diagram-space {
    border: 1px dashed #999;
    height: 140px;
    margin-top: 8px;
  }

  /* Utility: gives blank lines for handwritten answers */
  .answer-lines {
    margin-left: 22px;
  }
  .answer-lines .line {
    border-bottom: 1px solid #000;
    height: 20px;
    margin-bottom: 4px;
  }

  /* ---------- PAGE FRAME (added by exam-template.js) ----------
     Each PDF page is an iframe of 210 x 296.5mm. The old @page margin
     (14mm 16mm) becomes body padding so it also works inside the iframe. */
  html, body { margin: 0; }
  body { padding: 14mm 16mm; }
`;

// A4 page frame = 296.5mm high (see pdf-export.js); usable height = frame - top/bottom padding (14mm each)
const MM_TO_PX = 96 / 25.4;
const PAGE_CONTENT_LIMIT_PX = (296.5 - 28) * MM_TO_PX - 4; // 4px safety margin

// ---------- helpers ----------

const escapeHtml = (text = "") =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// One complete page document. (No DOCTYPE on purpose: pdf-export.js puts a <style> in front of it,
// so the measuring frame and the printed frame must use exactly the same HTML.)
const examDocumentHtml = (innerHtml) =>
  `<html><head><meta charset="utf-8"><style>${EXAM_CSS}</style></head><body>${innerHtml}</body></html>`;

// Removes anything dangerous from the model's HTML (scripts, event handlers, ...)
const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "form", "base", "title", "img", "foreignobject"]);
function sanitizeExamNode(root) {
  root.querySelectorAll("*").forEach((el) => {
    if (BLOCKED_TAGS.has(el.tagName.toLowerCase())) {
      el.remove();
      return;
    }
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
    }
  });
}

// ---------- parsing the model output ----------

// Rebuilds the header with the TEMPLATE markup (only the text comes from the image)
function buildHeaderHtml(headerEl, instructionsEl) {
  const text = (selector) => escapeHtml(headerEl.querySelector(selector)?.textContent.trim() || "");
  const knownTitleClasses = ["school-name", "exam-title", "exam-class", "exam-subject"];

  const titleLines = [...headerEl.querySelectorAll(".titles > div")]
    .map((line, index) => {
      const own = knownTitleClasses.find((c) => line.classList.contains(c));
      const cssClass = own || (index === 0 ? "school-name" : "exam-title");
      return line.textContent.trim() ? `<div class="${cssClass}">${escapeHtml(line.textContent.trim())}</div>` : "";
    })
    .join("");

  let html =
    `<header class="header-grid">` +
    `<div class="time">${text(".time")}</div>` +
    `<div class="titles">${titleLines}</div>` +
    `<div class="mm">${text(".mm")}</div>` +
    `</header><hr class="double-rule"><hr class="single-rule">`;

  const instructions = instructionsEl?.textContent.trim();
  if (instructions) html += `<div class="instructions">${escapeHtml(instructions)}</div>`;
  return html;
}

// One image's HTML -> { headerHtml, blocks[] }  (blocks = outerHTML of each .q-block)
function parseExamFragment(html, isFirstImage) {
  const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
  sanitizeExamNode(doc.body);

  const headerEl = doc.body.querySelector(".header-grid");
  const instructionsEl = doc.body.querySelector(".instructions");

  // The header is only taken from the first image; other images never contribute one
  const headerHtml = isFirstImage && headerEl ? buildHeaderHtml(headerEl, instructionsEl) : "";

  // Top-level question blocks (ignore a .q-block nested inside another one)
  let blocks = [...doc.body.querySelectorAll(".q-block")].filter((b) => b.parentElement.closest(".q-block") === null);

  // Fallback: the model skipped the wrapper classes -> keep whatever content it produced
  if (blocks.length === 0) {
    blocks = [...doc.body.children].filter(
      (el) => el !== headerEl && el !== instructionsEl && !el.matches("hr") && el.textContent.trim()
    );
    blocks.forEach((b) => b.classList.add("q-block"));
  }
  return { headerHtml, blocks: blocks.map((b) => b.outerHTML) };
}

// ---------- pagination ----------

// Hidden iframe with the exact same layout as a printed page, used to measure heights
async function createMeasureFrame() {
  const frame = document.createElement("iframe");
  frame.setAttribute("scrolling", "no");
  frame.style.cssText = "position:fixed;left:-99999px;top:0;width:210mm;height:296.5mm;border:0;visibility:hidden";
  document.body.appendChild(frame);
  await new Promise((ready) => {
    frame.onload = ready;
    frame.srcdoc = HIDE_SCROLLBARS_STYLE + examDocumentHtml('<div id="page"></div>');
  });
  try { await frame.contentDocument.fonts.ready; } catch (_) { /* older browsers */ }
  return frame;
}

// rawPages = array (one entry per image, in order) of the HTML the model returned (null = failed image)
// Returns an array of page HTML strings, ready for preparePdfPages().
async function buildExamPages(rawPages) {
  const parsed = rawPages.map((html, index) => (html ? parseExamFragment(html, index === 0) : null));

  const headerHtml = parsed[0] ? parsed[0].headerHtml : "";   // header: FIRST image only, page 1 only
  const blocks = parsed.flatMap((p) => (p ? p.blocks : []));  // questions of all images, in order
  if (blocks.length === 0) return [];

  const frame = await createMeasureFrame();
  try {
    const idoc = frame.contentDocument;
    const page = idoc.getElementById("page");
    const pages = [];

    const toElement = (html) => {
      const holder = idoc.createElement("div");
      holder.innerHTML = html;
      return holder.firstElementChild;
    };
    const fits = () => page.offsetHeight <= PAGE_CONTENT_LIMIT_PX;
    const hasQuestions = () => page.querySelector(".q-block") !== null;
    const flushPage = () => {
      pages.push(examDocumentHtml(page.innerHTML));
      page.innerHTML = ""; // pages after the first have NO header
    };

    // A question taller than the room left: spread its parts over pages.
    // (the heading goes with the first part; an MCQ question stays together with its options)
    const splitBlock = (block) => {
      const head = [...block.children].find((c) => c.classList.contains("q-head"));
      const rest = [...block.children].filter((c) => c !== head);

      let wrapper = null;
      let parts = rest;
      if (rest.length === 1 && rest[0].children.length > 0) {
        wrapper = rest[0]; // .q-body, .answer-lines, .jumbled-grid, table ...
        parts = wrapper.tagName === "TABLE" ? [...wrapper.querySelectorAll("tr")] : [...wrapper.children];
      }

      const groups = [];
      parts.forEach((part) => {
        if (part.classList && part.classList.contains("options-row") && groups.length) groups[groups.length - 1].push(part);
        else groups.push([part]);
      });

      let shell, shellTarget, placed;
      const startShell = (withHead) => {
        shell = block.cloneNode(false);
        if (withHead && head) shell.appendChild(head);
        shellTarget = wrapper ? shell.appendChild(wrapper.cloneNode(false)) : shell;
        page.appendChild(shell);
        placed = 0;
      };

      startShell(true);
      groups.forEach((group) => {
        group.forEach((node) => shellTarget.appendChild(node));
        if (!fits() && placed > 0) {
          group.forEach((node) => shellTarget.removeChild(node));
          flushPage();
          startShell(false);
          group.forEach((node) => shellTarget.appendChild(node));
        }
        placed++;
      });
    };

    page.innerHTML = headerHtml; // page 1 starts with the header

    for (const blockHtml of blocks) {
      const block = toElement(blockHtml);
      if (!block) continue;

      page.appendChild(block);
      if (fits()) continue;
      page.removeChild(block);

      // Not enough room: try a fresh page first
      if (hasQuestions()) {
        flushPage();
        page.appendChild(block);
        if (fits()) continue;
        page.removeChild(block);
      }
      splitBlock(block); // taller than a whole page
    }

    if (page.children.length) flushPage();
    return pages;
  } finally {
    frame.remove();
  }
}
