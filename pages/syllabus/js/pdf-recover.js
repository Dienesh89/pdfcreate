/* =========================================================
   pdf-recover.js – PRIVATE tool. Do NOT ship this on the public site.
   Recovers the hidden page HTML from a PDF made by pdf-export.js.

   Needs pdf.js loaded first, e.g.:
   <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>

   Usage:  const pages = await recoverHiddenPages(fileFromInput);
           // pages = array of HTML strings, in original order
   ========================================================= */

async function recoverHiddenPages(file) {
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const slices = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const text = content.items.map((it) => it.str).join("").replace(/\s+/g, "");
    const re = /HW1(\d+)\.(\d+)\.(\d+):/g;
    let m;
    while ((m = re.exec(text))) {
      const start = re.lastIndex;
      const len = +m[3];
      slices.push({ index: +m[1], count: +m[2], data: text.substr(start, len) });
      re.lastIndex = start + len;
    }
  }

  if (!slices.length) throw new Error("No hidden data found in this PDF.");
  slices.sort((a, b) => a.index - b.index);
  if (slices.length < slices[0].count) throw new Error("Hidden data is incomplete.");

  const payload = slices.map((s) => s.data).join("");
  const flag = payload[0];
  const bin = atob(payload.slice(1));
  let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));

  if (flag === "g") {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}