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
  font-family: 'Verdana', 'DejaVu Sans', 'Segoe UI', Arial, sans-serif;
  color: #111;
  font-size: 12.5px;
  line-height: 1.45;
  margin: 0;
  padding: 0;
}
:root {
  --mono: 'DejaVu Sans Mono', 'Courier New', Consolas, monospace;
  --ink: #111;
  --soft: #5a6a85;
  --line: #9aa4b5;
}

/* ---------- HEADER ---------- */
.header-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  column-gap: 10px;
}
.header-grid .time, .header-grid .mm { font-weight: 700; font-size: 13px; white-space: nowrap; }
.header-grid .time { text-align: left; }
.header-grid .mm   { text-align: right; }
.header-grid .titles { text-align: center; }

.school-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  margin: 0 0 3px 0;
}
.exam-title, .exam-class, .exam-subject, .exam-line {
  font-size: 14px;
  font-weight: 700;
  margin: 2px 0;
}
.exam-line { font-size: 13px; color: #1d3557; }

.header-rule { border: 0; border-top: 1.5px solid #000; margin: 9px 0 10px 0; }

/* Name / Roll No / Date box (added by the template, not by the AI) */
.student-box {
  display: flex;
  align-items: flex-end;
  gap: 18px;
  border: 1px solid #b6bfcd;
  background: #f5f7fb;
  border-radius: 6px;
  padding: 7px 12px;
  font-family: var(--mono);
  font-size: 11.5px;
  font-weight: 700;
}
.student-box .f { display: flex; align-items: flex-end; gap: 6px; white-space: nowrap; }
.student-box .f i { display: inline-block; border-bottom: 1px solid #333; height: 12px; }
.student-box .name { flex: 1.9; }  .student-box .name i { flex: 1; }
.student-box .roll { flex: 1; }    .student-box .roll i { flex: 1; }
.student-box .date { flex: 1.2; }  .student-box .date i { flex: 1; }

.instructions {
  text-align: center;
  font-weight: 700;
  text-decoration: underline;
  margin: 12px 0 12px 0;
  font-size: 13px;
}

/* ---------- QUESTION BLOCK ---------- */
.q-block { margin-bottom: 11px; }

.q-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: .01em;
  padding-bottom: 3px;
  margin-bottom: 7px;
  border-bottom: 1px dotted var(--line);
}
.q-title { text-decoration: none; }

/* marks in a circle */
.q-marks {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 21px;
  height: 21px;
  padding: 0 5px;
  margin-left: 10px;
  border: 1.5px solid #333;
  border-radius: 11px;
  background: #f3f5f9;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
}
.q-marks:empty { display: none; }

.q-body { margin-left: 0; }
.q-item { margin: 4px 0; }

/* ---------- ITEMS IN COLUMNS ---------- */
.items-2, .items-4 { display: grid; column-gap: 28px; row-gap: 8px; margin: 2px 0; }
.items-2 { grid-template-columns: 1fr 1fr; }
.items-4 { grid-template-columns: repeat(4, 1fr); column-gap: 14px; }
.items-2 .q-item, .items-4 .q-item { margin: 0; white-space: nowrap; display: flex; align-items: flex-end; gap: 6px; }
.items-2 .q-item .blank, .items-4 .q-item .blank { flex: 1; min-width: 40px; }
.items-2.spaced .q-item { word-spacing: .85em; }
.items-4 .q-item { justify-content: flex-start; }

/* ---------- BLANKS ---------- */
.word-bank { font-weight: 400; text-decoration: none; }
.blank {
  display: inline-block;
  min-width: 80px;
  height: 1.05em;
  border-bottom: 1.2px solid #222;
  vertical-align: bottom;
}
.blank.short { min-width: 50px; }

/* ---------- FILL IN THE BLANKS WITH CHOICES ---------- */
.fill .q-item { margin: 3px 0; }
.fill .blank { min-width: 62px; margin: 0 2px; }
.opts { font-style: italic; margin-left: 8px; color: #222; }

/* ---------- VERTICAL SUMS ---------- */
.calc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 2px; }
.calc {
  position: relative;
  border: 1px solid #b6bfcd;
  border-radius: 7px;
  background: #f7f9fc;
  padding: 9px 12px 8px 12px;
  font-family: var(--mono);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  min-height: 60px;
}
.calc-top, .calc-op { padding: 0 3px; line-height: 1.5; }
.calc-op { border-bottom: 1.5px solid #222; padding-bottom: 3px; margin-bottom: 11px; }
.calc.has-carry { padding-top: 22px; }
.calc.has-carry::before {
  content: "";
  position: absolute;
  top: 6px; left: 12px;
  width: 14px; height: 14px;
  border: 1.2px dotted #666;
  border-radius: 50%;
}

/* ---------- DIVISION ---------- */
.div-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.div-item {
  border: 1px solid #c8d0dc;
  background: #f1f4f9;
  border-radius: 6px;
  padding: 3px 4px;
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}

/* ---------- SHAPES (halves / quarters) ---------- */
.shape-rows { margin-top: 4px; }
.shape-row { display: flex; align-items: center; justify-content: space-between; margin: 7px 0; min-height: 42px; }
.shape-row .lbl { width: 78px; font-size: 15px; font-weight: 700; }
.shape-row .arrow { font-size: 18px; color: #333; }
.shape { display: inline-block; width: 38px; height: 38px; border: 1.2px solid #111; background: #fff; }
.shape.square { }
.shape.rect { width: 50px; height: 34px; }
.shape.circle { border-radius: 50%; }
.shape.diamond { width: 30px; height: 30px; transform: rotate(45deg); margin: 4px; }
.shape.triangle { position: relative; width: 46px; height: 40px; border: 0; background: #111; clip-path: polygon(50% 0, 0 100%, 100% 100%); }
.shape.triangle::after { content: ""; position: absolute; inset: 0; background: #fff; clip-path: polygon(50% 5%, 6% 95%, 94% 95%); }

/* ---------- DRAW BOXES ---------- */
.draw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.draw-box {
  min-height: 52px;
  border: 1px dashed #8b97ad;
  border-radius: 6px;
  background: #fbfcfe;
  padding: 3px 5px;
  font-weight: 700;
  font-size: 11.5px;
  color: #2d3b55;
}
.draw-box.tall { min-height: 100px; }
.draw-box.wide { grid-column: 1 / -1; }

/* ---------- WRITE-A-TABLE LINES ---------- */
.table-lines .tl { display: flex; align-items: flex-end; gap: 10px; margin: 7px 0 3px 0; font-size: 13.5px; }
.table-lines .tl b { white-space: nowrap; }
.table-lines .dots { flex: 1; border-bottom: 1.5px dotted #6b7788; height: 14px; }

/* ---------- MCQ / OPTIONS (2 per row) ---------- */
.options-row { display: flex; margin: 3px 0 3px 22px; gap: 40px; }
.options-row span { white-space: nowrap; }

/* ---------- TRUE / FALSE ---------- */
.tf-item { margin: 5px 0 5px 22px; }

/* ---------- JUMBLED WORDS (2 columns) ---------- */
.jumbled-grid { display: grid; grid-template-columns: 1fr 1fr; row-gap: 5px; margin-left: 22px; max-width: 320px; }

/* ---------- MATCH THE FOLLOWING ---------- */
.match-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
.match-table td { padding: 8px 8px; vertical-align: middle; font-size: 12.5px; }
.match-table td.icon-cell { width: 90px; }
.icon-box {
  width: 64px; height: 46px;
  border: 1px solid #555;
  background: #eef0f3;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 16px;
  border-radius: 2px;
}

/* ---------- DIAGRAM / ANSWER SPACE ---------- */
.diagram-space { border: 1px dashed #999; height: 140px; margin-top: 8px; border-radius: 4px; }
.answer-lines { margin-left: 22px; }
.answer-lines .line { border-bottom: 1px solid #000; height: 20px; margin-bottom: 4px; }

/* ---------- PAGE FOOTER (added by exam-template.js) ---------- */
.page-footer {
  position: fixed;
  left: 16mm; right: 16mm; bottom: 9mm;
  display: flex; justify-content: space-between;
  border-top: 1px solid #cfd6e2;
  padding-top: 5px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--soft);
}

/* ---------- PAGE FRAME (added by exam-template.js) ----------
   Each PDF page is an iframe of 210 x 296.5mm. The old @page margin
   becomes body padding so it also works inside the iframe. */
html, body { margin: 0; }
body { padding: 14mm 16mm; }
`;

// A4 page frame = 296.5mm high (see pdf-export.js); usable height = frame - top/bottom padding (14mm each)
const MM_TO_PX = 96 / 25.4;
// footer lives in the bottom 20mm, so content may use: frame - 14mm top - 20mm bottom
const PAGE_CONTENT_LIMIT_PX = (296.5 - 14 - 20) * MM_TO_PX - 4; // 4px safety margin

// ---------- helpers ----------

const escapeHtml = (text = "") =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// One complete page document. (No DOCTYPE on purpose: pdf-export.js puts a <style> in front of it,
// so the measuring frame and the printed frame must use exactly the same HTML.)
const examDocumentHtml = (innerHtml, footerHtml = "") =>
  `<html><head><meta charset="utf-8"><style>${EXAM_CSS}</style></head><body>${innerHtml}${footerHtml}</body></html>`;

// "G.P.S. Mechanised School — Class II Maths" .......... "Page 1 of 2"
const pageFooterHtml = (footerText, pageNo, pageCount) =>
  `<div class="page-footer"><span>${escapeHtml(footerText)}</span><span>Page ${pageNo} of ${pageCount}</span></div>`;

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

// "2026-27" -> "2026–27" (en dash, like the printed template)
const prettyYears = (t) => t.replace(/(\d{4})\s*-\s*(\d{2,4})/g, "$1–$2");

// Rebuilds the header with the TEMPLATE markup (only the text comes from the image).
// Returns { html, footerText }: footerText = "School name — Class II Maths" for the page footers.
function buildHeaderHtml(headerEl, instructionsEl) {
  const text = (selector) => escapeHtml(headerEl.querySelector(selector)?.textContent.trim() || "");
  const knownTitleClasses = ["school-name", "exam-title", "exam-class", "exam-subject"];

  // read every title line once: { cls, value }
  const lines = [...headerEl.querySelectorAll(".titles > div")]
    .map((line, index) => {
      const own = knownTitleClasses.find((c) => line.classList.contains(c));
      return { cls: own || (index === 0 ? "school-name" : "exam-title"), value: line.textContent.trim() };
    })
    .filter((l) => l.value);

  const school = lines.find((l) => l.cls === "school-name")?.value || "";
  const classLine = lines.find((l) => l.cls === "exam-class");
  const subjectLine = lines.find((l) => l.cls === "exam-subject");
  const className = classLine?.value.replace(/^\s*class\s*[-:.–]*\s*/i, "").trim() || "";
  const subjectName = subjectLine?.value.replace(/^\s*sub(?:ject)?\s*[-:.–]*\s*/i, "").trim() || "";

  // "Sub- Maths" + "Class - II"  ->  one line "Sub: Maths | Class: II"
  const combined = [subjectName && `Sub: ${subjectName}`, className && `Class: ${className}`].filter(Boolean).join(" | ");

  const titleLines = lines
    .filter((l) => l.cls !== "exam-class" && l.cls !== "exam-subject")
    .map((l) => `<div class="${l.cls}">${escapeHtml(prettyYears(l.value))}</div>`)
    .join("") + (combined ? `<div class="exam-line">${escapeHtml(combined)}</div>` : "");

  let html =
    `<header class="header-grid">` +
    `<div class="time">${text(".time")}</div>` +
    `<div class="titles">${titleLines}</div>` +
    `<div class="mm">${text(".mm")}</div>` +
    `</header><hr class="header-rule">` +
    `<div class="student-box">` +
    `<span class="f name">Name: <i></i></span><span class="f roll">Roll No: <i></i></span><span class="f date">Date: <i></i></span>` +
    `</div>`;

  const instructions = instructionsEl?.textContent.trim();
  if (instructions) html += `<div class="instructions">${escapeHtml(instructions)}</div>`;

  const footerText = [school, [className && `Class ${className}`, subjectName].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" — ");
  return { html, footerText };
}

// One image's HTML -> { headerHtml, footerText, blocks[] }  (blocks = the .q-block elements)
function parseExamFragment(html, isFirstImage) {
  const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
  sanitizeExamNode(doc.body);

  const headerEl = doc.body.querySelector(".header-grid");
  const instructionsEl = doc.body.querySelector(".instructions");

  // The header is only taken from the first image; other images never contribute one
  const header = isFirstImage && headerEl ? buildHeaderHtml(headerEl, instructionsEl) : { html: "", footerText: "" };

  // Top-level question blocks (ignore a .q-block nested inside another one)
  let blocks = [...doc.body.querySelectorAll(".q-block")].filter((b) => b.parentElement.closest(".q-block") === null);

  // Fallback: the model skipped the wrapper classes -> keep whatever content it produced
  if (blocks.length === 0) {
    blocks = [...doc.body.children].filter(
      (el) => el !== headerEl && el !== instructionsEl && !el.matches("hr") && el.textContent.trim()
    );
    blocks.forEach((b) => b.classList.add("q-block"));
  }
  return { headerHtml: header.html, footerText: header.footerText, blocks };
}

// ---------- tidy question titles + marks ----------

// Handwritten numbering is messy ("1-", "5.)", "6-A", "B)", "Q-10", "Q-"). Make it uniform: "1.", "6-A.", "10."
// Sub-questions that only have a letter ("B)") continue the last number ("6-B."); a bare "Q-" gets the next number.
function tidyQuestionBlocks(blocks) {
  let lastNumber = 0;
  blocks.forEach((block) => {
    const marks = block.querySelector(".q-marks");
    if (marks) marks.textContent = marks.textContent.replace(/[()\s]/g, ""); // "(4)" -> "4" (drawn in a circle)

    // "a) <u>5</u>63 = ____": keep the text in one piece, the blank stretches to the end of the column
    block.querySelectorAll(".items-2 .q-item, .items-4 .q-item").forEach((item) => {
      const blank = item.lastElementChild;
      if (!blank || !blank.classList.contains("blank")) return;
      const lead = item.ownerDocument.createElement("span");
      lead.className = "lead";
      while (item.firstChild && item.firstChild !== blank) lead.appendChild(item.firstChild);
      item.insertBefore(lead, blank);
    });

    const title = block.querySelector(".q-title");
    const node = title && [...title.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return;
    let t = node.textContent.replace(/^\s+/, "");
    let m;

    if ((m = t.match(/^(\d+)\s*-\s*([A-Za-z])\s*[.)\-:]*\s+/))) {        // "6-A Multiply"
      lastNumber = +m[1];
      t = `${m[1]}-${m[2].toUpperCase()}. ` + t.slice(m[0].length);
    } else if ((m = t.match(/^Q?\s*\.?\s*-?\s*(\d+)\s*[-–.):]*\s*/i))) {   // "1- ", "5.) ", "Q-10 ", "12 "
      lastNumber = +m[1];
      t = `${m[1]}. ` + t.slice(m[0].length);
    } else if ((m = t.match(/^([A-PR-Za-pr-z])\s*[.)\-:]+\s*/)) && lastNumber) {  // "B) Multiply" (Q is the question marker, not a part)
      t = `${lastNumber}-${m[1].toUpperCase()}. ` + t.slice(m[0].length);
    } else if ((m = t.match(/^Q\s*[.\-–:]*\s*/i))) {                       // "Q- Fill in the blanks"
      lastNumber += 1;
      t = `${lastNumber}. ` + t.slice(m[0].length);
    }
    node.textContent = t;
  });
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
  const footerText = parsed[0] ? parsed[0].footerText : "";   // "School — Class II Maths" on every page
  const blockElements = parsed.flatMap((p) => (p ? p.blocks : []));  // questions of all images, in order
  if (blockElements.length === 0) return [];
  tidyQuestionBlocks(blockElements);
  const blocks = blockElements.map((b) => b.outerHTML);

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
      pages.push(page.innerHTML);
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

    // every page gets its footer ("... Page 1 of N") now that the page count is known
    return pages.map((inner, i) => examDocumentHtml(inner, pageFooterHtml(footerText, i + 1, pages.length)));
  } finally {
    frame.remove();
  }
}
