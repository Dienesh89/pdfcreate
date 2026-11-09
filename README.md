# PDF Create

Tools that turn photos of handwritten pages into print-ready A4 PDFs.

The app runs on Next.js. The existing browser tools are served from `public/`, and
the `/api/pdf` route renders their HTML pages with headless Chromium and returns a PDF
download directly (no print dialog). Downloads keep the source HTML in the PDF text
layer so it can be recovered by the built-in Edit Text tool. The renderer bundles
Noto Sans Devanagari for Hindi text.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. Use `npm run build` and `npm start` for a production build.
The download button shows a five-second countdown and spinner while the server creates
the PDF. Browser libraries are served from `public/vendor/`, so the tools do not depend
on their CDNs remaining available. Internet is still required for Google Fonts and the
Puter sign-in and AI services.

| Page | What it does | Uses AI |
|------|--------------|---------|
| `public/pages/hw-to-pdf` | handwritten notebook pages -> A4 PDF | yes |
| `public/pages/syllabus` | handwritten syllabus -> formatted syllabus PDF | yes |
| `public/pages/exam-paper-maker` | handwritten question paper -> formatted exam paper PDF | yes |
| `public/pages/edit-pdf`, `public/pages/pdf-editor`, `public/pages/pdf-editor-full` | PDF editing tools | no |
| `public/pages/merge-pdf` | combine several PDFs into one (drag to reorder) | no |
| `public/pages/split-pdf` | split by page ranges, every N pages, or selected pages (ZIP for multiple files) | no |

Merge and Split run entirely in the browser with the vendored `pdf-lib` and `pdf.js`; files are never uploaded. Shared code: `public/css/pdf-tools.css`, `public/js/pdf-tools.js`.

## AI = Puter (one shared integration, no API keys)

Every AI page uses the locally hosted **Puter.js** client from `public/vendor/puter/puter.js`
with shared site integration in `public/js/puter-ai.js`
(styles: `public/css/puter-auth.css`).

- Visitors sign in once with a free Puter account, and the visitor's monthly free
  allowance pays for AI usage. No API key is needed.
- Images go straight to Puter; they are not uploaded to an image host.
- `PUTER_MODELS` in `public/js/puter-ai.js` defines the model and automatic fallbacks.
- Shared handling covers busy models, retries, empty answers, sign-in and exhausted allowances.

Each AI page keeps its own `js/config.js` and `js/convert-flow.js` for its prompts,
image settings, sanity checks and layout templates.

## Shared "add files" list

Merge PDF and the three image pages (`hw-to-pdf`, `syllabus`, `exam-paper-maker`) share one
file-list experience: `public/js/file-list.js` + `public/css/file-list.css` (dropzone, thumbnails,
drag-to-reorder with mouse or finger, up/down arrows, Clear all, summary bar). Image thumbnails are
decoded at small size, so large phone photos do not stay in memory.

## Performance notes (phones)

- No `backdrop-filter` / `filter: blur()` anywhere; soft backgrounds use radial-gradients.
- Continuous decorative animations are off on phones/touch screens and pause when the hero is scrolled away.
- Canvases (page previews, thumbnails, compressed images) are released as soon as they are not needed.
- Puter.js and SweetAlert load at the end of the page so the first paint is not blocked.
- `next.config.mjs` sets long cache headers for `/vendor` and short ones for `/css` and `/js`.

## SEO

- Every page has a unique `<title>`, meta description, canonical URL, Open Graph / Twitter tags and JSON-LD
  (home: `WebSite` + `WebApplication`; tools: `WebApplication` + `BreadcrumbList`). Each page has exactly one `<h1>`.
- Each tool page has a how-to + FAQ block (`.seo-content`) under the tool for search text.
- `/` serves the home page directly (rewrite in `next.config.mjs`); `/index.html` 301-redirects to `/`.
- `public/robots.txt`, `public/sitemap.xml`, `public/favicon.svg`, `public/og-image.png`.
- **Before deploying, set your real domain** (replaces the `https://YOUR-DOMAIN.com` placeholder everywhere):

  ```sh
  npm run seo:domain -- https://your-domain.com
  ```
- New page checklist: add title, description, canonical, OG tags, one `<h1>`, and an entry in `sitemap.xml`.
