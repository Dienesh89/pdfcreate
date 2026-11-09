import { copyFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 30;
const PDF_FONT_PATH = join(
  process.cwd(),
  "app/api/pdf/fonts/NotoSansDevanagari.ttf"
);
const CHROMIUM_FONT_PATH = join(
  tmpdir(),
  "fonts/fonts/NotoSansDevanagari.ttf"
);
let pdfFontsReady;

async function installPdfFonts() {
  if (!pdfFontsReady) {
    pdfFontsReady = (async () => {
      await mkdir(dirname(CHROMIUM_FONT_PATH), { recursive: true });
      await copyFile(PDF_FONT_PATH, CHROMIUM_FONT_PATH);
      process.env.FONTCONFIG_PATH ??= join(tmpdir(), "fonts");
    })();
  }
  await pdfFontsReady;
}

function hiddenSliceHtml(slice, index, count) {
  return (
    '<div aria-hidden="true" style="position:fixed;left:0;bottom:0;width:100%;max-height:400px;' +
    "overflow:hidden;margin:0;padding:0;font:2px/2px monospace;word-break:break-all;" +
    'color:rgba(0,0,0,0.01);pointer-events:none;user-select:none">' +
    `HW1${index}.${count}.${slice.length}:${slice}</div>`
  );
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function addHiddenPayload(pages) {
  const payload = `g${gzipSync(Buffer.from(JSON.stringify(pages))).toString("base64")}`;
  const sliceSize = Math.ceil(payload.length / pages.length);

  return pages.map((html, index) => {
    const hidden = hiddenSliceHtml(
      payload.slice(index * sliceSize, (index + 1) * sliceSize),
      index,
      pages.length
    );
    const bodyEnd = /<\/body\s*>/i;
    return bodyEnd.test(html) ? html.replace(bodyEnd, `${hidden}</body>`) : `${html}${hidden}`;
  });
}

function createPrintDocument(pages) {
  const frames = pages
    .map(
      (html) =>
        `<iframe title="PDF page" scrolling="no" srcdoc="${escapeAttribute(
          `<style>html,body{overflow:hidden!important}::-webkit-scrollbar{display:none}</style>${html}`
        )}"></iframe>`
    )
    .join("");

  return `<!doctype html>
    <html><head><meta charset="utf-8"><style>
      @page{size:A4;margin:0}
      html,body{margin:0;padding:0;width:210mm;background:#fff}
      iframe{display:block;width:210mm;height:296.5mm;border:0;background:#fff;break-after:page;page-break-after:always}
      iframe:last-child{break-after:auto;page-break-after:auto}
    </style></head><body>${frames}</body></html>`;
}

function plainError(message, status) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}

export async function POST(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return plainError("PDF request is too large.", 413);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return plainError("Request body must be valid JSON.", 400);
  }

  if (
    !input ||
    !Array.isArray(input.pages) ||
    input.pages.length === 0 ||
    input.pages.length > MAX_PAGES ||
    input.pages.some((page) => typeof page !== "string" || Buffer.byteLength(page) > MAX_PAGE_BYTES)
  ) {
    return plainError("Provide 1 to 30 HTML pages, each no larger than 2 MB.", 400);
  }

  if (Buffer.byteLength(JSON.stringify(input.pages)) > MAX_REQUEST_BYTES) {
    return plainError("PDF request is too large.", 413);
  }

  const pages = addHiddenPayload(input.pages);
  const filename =
    typeof input.filename === "string"
      ? input.filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 100)
      : "document";
  const downloadName = `${filename || "document"}.pdf`;

  let browser;
  try {
    const executablePath = await chromium.executablePath();
    await installPdfFonts();
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true
    });

    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (resource) => {
      if (/^(about:|data:)/i.test(resource.url())) {
        resource.continue();
      } else {
        resource.abort();
      }
    });
    await page.setContent(createPrintDocument(pages), { waitUntil: "load" });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("PDF generation failed:", error);
    return plainError("Could not generate the PDF. Please try again.", 500);
  } finally {
    if (browser) await browser.close();
  }
}
