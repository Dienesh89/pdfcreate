/* =========================================================
   syllabus-template.js – builds the final syllabus from the AI output
   - holds the syllabus template look (same CSS as syllabus_template.html)
   - takes the subject rows read from every image (in order)
   - header (school / term line / class line) is used from the FIRST image
     only and is printed on page 1 only
   - fills A4 pages one after another; the table heading (Subject | Syllabus)
     is repeated on every page; a very tall subject row is split across pages
   Result: array of complete page HTML strings -> preparePdfPages()
   ========================================================= */

// Same styling as syllabus_template.html (@page + .page wrapper replaced by body padding)
const SYLLABUS_CSS = `
  :root {
    --theme-color: #111111;  /* table header + borders */
    --title-color: #222222;  /* school name / term line */
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: 'Arial', 'Segoe UI', 'Helvetica', sans-serif;
    color: #111;
    font-size: 14px;
    line-height: 1.4;
    padding: 14mm 16mm;
  }

  /* ---------- HEADER (centered, underlined, black) ---------- */
  header { text-align: center; margin-bottom: 14px; }

  .school-name {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--title-color);
    text-decoration: underline;
    text-underline-offset: 4px;
    margin: 0 0 4px 0;
  }

  .term-line,
  .class-line {
    font-size: 15px;
    font-weight: 700;
    color: var(--title-color);
    text-decoration: underline;
    text-underline-offset: 3px;
    margin: 3px 0;
  }

  /* ---------- SYLLABUS TABLE ---------- */
  .syllabus-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--theme-color);
  }

  .syllabus-table th {
    background: var(--theme-color);
    color: #fff;
    font-size: 17px;
    font-weight: 700;
    padding: 5px 8px;
    border: 1px solid var(--theme-color);
  }
  .syllabus-table th.col-subject { width: 20%; }

  .syllabus-table td {
    border: 1px solid var(--theme-color);
    padding: 7px 8px;
    vertical-align: middle;
  }

  .syllabus-table td.subject {
    text-align: center;
    font-weight: 700;
    font-size: 15px;
    color: #222;
  }
  /* "(contd.)" under the subject name when a subject continues on the next page */
  .syllabus-table td.subject .contd {
    font-weight: 400;
    font-size: 12px;
  }

  .syllabus-table td.topics { text-align: left; }

  .syllabus-table td.topics .line + .line { margin-top: 2px; }

  /* Hindi rows */
  .syllabus-table td.hi {
    font-family: 'Noto Sans Devanagari', 'Mangal', 'Nirmala UI', 'Kohinoor Devanagari', 'Arial Unicode MS', sans-serif;
    line-height: 1.6;
  }

  /* Row with two separate parts divided by a thin rule (e.g. Moral/G.K) */
  .syllabus-table td.topics .line.divided {
    padding-top: 9px;
    margin-top: 9px;
    border-top: 1px solid var(--theme-color);
    margin-left: -8px; margin-right: -8px;
    padding-left: 8px; padding-right: 8px;
  }

  tr { page-break-inside: avoid; }
`;

// A4 page frame = 296.5mm high (see pdf-export.js); usable height = frame - top/bottom padding (14mm each)
const MM_TO_PX = 96 / 25.4;
const PAGE_CONTENT_LIMIT_PX = (296.5 - 28) * MM_TO_PX - 4; // 4px safety margin

// Table markup used at the top of every page (the heading row repeats on each page)
const SYLLABUS_TABLE_SHELL =
  `<table class="syllabus-table"><thead><tr><th class="col-subject">Subject</th><th>Syllabus</th></tr></thead><tbody></tbody></table>`;

const DEVANAGARI = /[\u0900-\u097F]/;

// ---------- helpers ----------

const escapeHtml = (text = "") =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// One complete page document. (No DOCTYPE on purpose: pdf-export.js puts a <style> in front of it,
// so the measuring frame and the printed frame must use exactly the same HTML.)
const syllabusDocumentHtml = (innerHtml) =>
  `<html><head><meta charset="utf-8"><style>${SYLLABUS_CSS}</style></head><body>${innerHtml}</body></html>`;

// Only these inline tags survive from the model's HTML (all attributes are dropped).
const INLINE_TAGS = { b: "b", strong: "b", i: "i", em: "i", u: "u", sub: "sub", sup: "sup" };
const DROPPED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "form", "base", "title", "img", "svg", "foreignobject"]);

// Rebuilds a node's content as safe HTML: text is escaped, <b>/<i>/<u>/<sub>/<sup>/<br> are kept,
// every other tag is unwrapped, scripts and the like are dropped.
function cleanInline(node) {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      out += escapeHtml(child.textContent);
    } else if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase();
      if (tag === "br") out += "<br>";
      else if (INLINE_TAGS[tag]) out += `<${INLINE_TAGS[tag]}>${cleanInline(child)}</${INLINE_TAGS[tag]}>`;
      else if (!DROPPED_TAGS.has(tag)) out += cleanInline(child);
    }
  });
  return out.trim();
}

const visibleText = (html) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

// ---------- parsing the model output ----------

// Rebuilds the header with the TEMPLATE markup (only the text comes from the image)
function buildHeaderHtml(doc) {
  const known = ["school-name", "term-line", "class-line"];
  const lines = [...doc.body.querySelectorAll("header > div, .school-name, .term-line, .class-line")]
    .map((el, index) => {
      const text = el.textContent.trim();
      if (!text) return "";
      const cssClass = known.find((c) => el.classList.contains(c)) || (index === 0 ? "school-name" : "term-line");
      return `<div class="${cssClass}">${escapeHtml(text)}</div>`;
    })
    .join("");
  return lines ? `<header>${lines}</header>` : "";
}

// The topics cell -> [{ html, divided }]  (one entry per written line)
function readTopicLines(topicsCell) {
  let lineEls = [...topicsCell.querySelectorAll(".line")];
  if (!lineEls.length) lineEls = [...topicsCell.children].filter((el) => /^(div|p|li)$/i.test(el.tagName));

  const lines = lineEls.length
    ? lineEls.map((el) => ({ html: cleanInline(el), divided: el.classList.contains("divided") }))
    : cleanInline(topicsCell).split(/<br\s*\/?>/i).map((html) => ({ html: html.trim(), divided: false }));

  return lines.filter((line) => visibleText(line.html));
}

// One image's HTML -> { headerHtml, rows[] }   (row = { subject, lines[] })
function parseSyllabusFragment(html, isFirstImage) {
  // A <tr> outside a <table> is dropped by the HTML parser, so wrap loose rows first
  if (!/<table/i.test(html)) {
    html = html.replace(/<tr[\s>][\s\S]*<\/tr>/i, (rows) => `<table><tbody>${rows}</tbody></table>`);
  }
  const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");

  // The header is only taken from the first image; other images never contribute one
  const headerHtml = isFirstImage ? buildHeaderHtml(doc) : "";

  const rows = [];
  doc.body.querySelectorAll("tr").forEach((tr) => {
    if (tr.querySelector("th")) return; // the table heading is always built by the template
    const cells = [...tr.children].filter((c) => c.tagName === "TD");
    if (!cells.length) return;

    const subjectCell = tr.querySelector("td.subject") || (cells.length > 1 ? cells[0] : null);
    const topicsCell = tr.querySelector("td.topics") || (cells.length > 1 ? cells[1] : cells[0]);
    const subject = subjectCell ? cleanInline(subjectCell) : "";
    const lines = readTopicLines(topicsCell);
    if (!subject && !lines.length) return;
    rows.push({ subject, lines });
  });
  return { headerHtml, rows };
}

// A row with no subject name is the continuation of the previous subject (its list ran onto the next image)
function mergeContinuedRows(rows) {
  const merged = [];
  rows.forEach((row) => {
    if (!row.subject && merged.length) merged[merged.length - 1].lines.push(...row.lines);
    else merged.push({ subject: row.subject, lines: [...row.lines] });
  });
  return merged;
}

// ---------- row markup ----------

// Template markup of one subject row. `contd` = this is the 2nd, 3rd... part of a split subject.
function rowHtml(row, contd = false) {
  const subjectHi = DEVANAGARI.test(visibleText(row.subject)) ? " hi" : "";
  const topicsHi = DEVANAGARI.test(row.lines.map((l) => visibleText(l.html)).join("")) ? " hi" : "";

  // Handwritten line breaks are ignored: all lines of a subject flow together as one paragraph and
  // wrap only when the table cell is full. Only a "divided" line (ruled line in the image) starts a new part.
  const groups = [];
  row.lines.forEach((line, index) => {
    if (line.divided && index > 0) groups.push({ divided: true, parts: [line.html] });
    else if (groups.length) groups[groups.length - 1].parts.push(line.html);
    else groups.push({ divided: false, parts: [line.html] });
  });
  const lines = groups
    .map((g) => `<div class="line${g.divided ? " divided" : ""}">${g.parts.join(" ")}</div>`)
    .join("");

  const subject = row.subject + (contd ? '<div class="contd">(contd.)</div>' : "");
  return (
    `<tr><td class="subject${subjectHi}">${subject}</td>` +
    `<td class="topics${topicsHi}">${lines}</td></tr>`
  );
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
    frame.srcdoc = HIDE_SCROLLBARS_STYLE + syllabusDocumentHtml('<div id="page"></div>');
  });
  try { await frame.contentDocument.fonts.ready; } catch (_) { /* older browsers */ }
  return frame;
}

// rawPages = array (one entry per image, in order) of the HTML the model returned (null = failed image)
// Returns an array of page HTML strings, ready for preparePdfPages().
async function buildSyllabusPages(rawPages) {
  const parsed = rawPages.map((html, index) => (html ? parseSyllabusFragment(html, index === 0) : null));

  const headerHtml = parsed[0] ? parsed[0].headerHtml : "";                          // header: FIRST image only, page 1 only
  const rows = mergeContinuedRows(parsed.flatMap((p) => (p ? p.rows : [])));         // subjects of all images, in order
  if (rows.length === 0) return [];

  const frame = await createMeasureFrame();
  try {
    const idoc = frame.contentDocument;
    const page = idoc.getElementById("page");
    const pages = [];
    let tbody = null;

    const toRow = (html) => {
      const holder = idoc.createElement("tbody"); // parsed in tbody context, so <tr> is kept
      holder.innerHTML = html;
      return holder.firstElementChild;
    };
    const fits = () => page.offsetHeight <= PAGE_CONTENT_LIMIT_PX;
    const hasRows = () => tbody.children.length > 0;

    const startPage = (withHeader) => {
      page.innerHTML = (withHeader ? headerHtml : "") + SYLLABUS_TABLE_SHELL;
      tbody = page.querySelector("tbody");
    };
    const flushPage = () => {
      pages.push(syllabusDocumentHtml(page.innerHTML));
      startPage(false); // pages after the first have NO header (the table heading repeats)
    };

    // A subject taller than a whole page: its lines are spread over pages,
    // the subject name is repeated with "(contd.)"
    const splitRow = (row) => {
      let contd = false;
      let part = [];
      let tr = null;
      const draw = () => {
        const fresh = toRow(rowHtml({ subject: row.subject, lines: part }, contd));
        if (tr) tbody.replaceChild(fresh, tr);
        else tbody.appendChild(fresh);
        tr = fresh;
      };
      for (const line of row.lines) {
        part.push(line);
        draw();
        if (!fits() && part.length > 1) {
          part.pop();
          draw();            // put this part back as it was
          flushPage();
          contd = true;
          part = [line];
          tr = null;
          draw();
        }
      }
    };

    startPage(true); // page 1 starts with the header

    for (const row of rows) {
      const tr = toRow(rowHtml(row));
      tbody.appendChild(tr);
      if (fits()) continue;
      tbody.removeChild(tr);

      // Not enough room: try a fresh page first (a subject row is never split if it fits on one page)
      if (hasRows()) {
        flushPage();
        tbody.appendChild(tr);
        if (fits()) continue;
        tbody.removeChild(tr);
      }
      splitRow(row); // taller than a whole page
    }

    if (hasRows()) flushPage();
    return pages;
  } finally {
    frame.remove();
  }
}
