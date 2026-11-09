# Syllabus Maker

Turns photos of a handwritten syllabus (max 3) into a formatted syllabus PDF.
Each image is compressed and sent to a vision AI model (through Puter) that transcribes the header and
the subject rows; `syllabus-template.js` lays them out on A4 pages (header on page 1 only).

**No API key needed.** The AI runs on Puter: the visitor signs in with a free Puter account and its
free monthly allowance pays for the usage. The Puter connection, model list and error handling are
shared by all pages in `../../js/puter-ai.js` (see the README in the site root).

Serve the site over http/https (the Puter sign-in popup does not work from `file://`).

## Files of this page

```
index.html            page markup (sign-in card, upload card, Convert button)
css/                  base, image picker, image preview, modal styles (Puter card style: ../../css/puter-auth.css)
js/                   (loaded in this order from index.html)
  config.js           settings + the syllabus prompts + the runaway-number retry note
  syllabus-template.js  turns the AI rows into A4 pages
  dom.js              references to HTML elements
  utils.js            sleep(), SweetAlert preset
  image-list.js       add / remove / draw selected images, drag & drop
  ../../js/puter-ai.js  SHARED: Puter sign-in, image compression, image -> HTML with model fallback
  pdf-export.js       prepares pages for the shared Next.js PDF endpoint
  convert-flow.js     full pipeline behind the Convert button (passes this page's prompt to the shared engine)
  main.js             start-up: connects everything
```

## Flow

Convert button -> signed in to Puter? (popup if not) -> `prepareImagesForAi` -> `convertImagesToHtml` -> 5-second download countdown -> `/api/pdf`
