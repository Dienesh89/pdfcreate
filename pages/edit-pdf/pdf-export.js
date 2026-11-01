/* =========================================================
   pdf-export.js – HTML pages -> ONE merged PDF
   Puts every page (one A4 sheet each) in a single print job.
   Choose "Save as PDF" in the print dialog to get one PDF file.
   `pages` = array of HTML strings (a single string also works).

   Each page also carries an invisible slice of the source HTML
   (gzip + base64, near-zero alpha, 2px text). It lives in the PDF's
   text layer and can be recovered later with pdf-recover.js.
   ========================================================= */

// Page frames + print rules. On Android Chrome iframe.print() prints the WHOLE site,
// so we print the top window and hide everything except our own pages container.
const PRINT_CSS = `
@media screen{
  #pdf-print-root{position:fixed;left:-99999px;top:0;width:210mm;pointer-events:none}
}
#pdf-print-root iframe{display:block;width:210mm;height:296.5mm;border:0;background:#fff}
@media print{
  @page{size:A4;margin:0}
  html.pdf-printing,html.pdf-printing body{height:auto!important;overflow:visible!important;margin:0!important;padding:0!important;background:#fff!important}
  html.pdf-printing body > *:not(#pdf-print-root){display:none!important}
  #pdf-print-root{position:static!important;width:auto!important;overflow:visible!important;padding:0!important;background:#fff!important}
  #pdf-print-root iframe{margin:0!important;break-after:page;page-break-after:always}
  #pdf-print-root iframe:last-child{break-after:auto;page-break-after:auto}
}`;

// Injected into every page so no scrollbar can appear
const HIDE_SCROLLBARS_STYLE =
  "<style>html,body{overflow:hidden!important}::-webkit-scrollbar{display:none}</style>";

/* ---------- hidden payload (embed) ---------- */

// pages[] -> JSON -> gzip (if supported) -> base64. First char: "g" = gzip, "r" = raw.
async function packHiddenPayload(pages) {
  let bytes = new TextEncoder().encode(JSON.stringify(pages));
  let flag = "r";
  if (typeof CompressionStream === "function") {
    try {
      const gz = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(gz).arrayBuffer());
      flag = "g";
    } catch (_) { /* fall back to raw */ }
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return flag + btoa(bin);
}

// One invisible block: "HW1<index>.<count>.<length>:<slice>"
function hiddenSliceHtml(slice, index, count) {
  return (
    '<div aria-hidden="true" style="position:fixed;left:0;bottom:0;width:100%;max-height:400px;' +
    "overflow:hidden;margin:0;padding:0;font:2px/2px monospace;word-break:break-all;" +
    'color:rgba(0,0,0,0.01);pointer-events:none;user-select:none">' +
    `HW1${index}.${count}.${slice.length}:${slice}</div>`
  );
}

// Returns the pages with a hidden slice appended to each. Never throws:
// if anything fails the plain pages are printed instead.
async function attachHiddenPayload(pages) {
  try {
    const payload = await packHiddenPayload(pages);
    const size = Math.ceil(payload.length / pages.length);
    return pages.map(
      (html, i) => html + hiddenSliceHtml(payload.slice(i * size, (i + 1) * size), i, pages.length)
    );
  } catch (err) {
    console.error(err);
    return pages;
  }
}

/* ---------- print ---------- */

// The pages are built once (hidden, off-screen) and stay in the document until
// discardPreparedPdf() is called. Android Chrome re-renders the print preview and the
// saved PDF from the LIVE page, so the pages must still be there while the user saves.
let preparedPdf = null;

async function preparePdfPages(pages) {
  discardPreparedPdf();
  if (typeof pages === "string") pages = [pages];
  const carrierPages = await attachHiddenPayload(pages);

  const style = document.createElement("style");
  style.textContent = PRINT_CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "pdf-print-root";
  document.body.appendChild(root);

  // One iframe per page, so each page's own CSS stays isolated
  await Promise.all(
    carrierPages.map(
      (html) =>
        new Promise((pageReady) => {
          const pageFrame = document.createElement("iframe");
          pageFrame.setAttribute("scrolling", "no");
          pageFrame.onload = pageReady;
          pageFrame.srcdoc = HIDE_SCROLLBARS_STYLE + html;
          root.appendChild(pageFrame);
        })
    )
  );
  preparedPdf = { style, root };
}

// Must be called from a tap/click (user gesture) - Android ignores print() otherwise.
function printPreparedPdf() {
  if (!preparedPdf) return;
  document.documentElement.classList.add("pdf-printing");
  window.print();
}

function discardPreparedPdf() {
  if (!preparedPdf) return;
  document.documentElement.classList.remove("pdf-printing");
  preparedPdf.root.remove();
  preparedPdf.style.remove();
  preparedPdf = null;
}
