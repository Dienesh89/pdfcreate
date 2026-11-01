# PDF Create - website

Tools that turn photos of handwritten pages into print-ready A4 PDFs.

| Page | What it does | Uses AI |
|------|--------------|---------|
| `pages/hw-to-pdf` | handwritten notebook pages -> A4 PDF | yes |
| `pages/syllabus` | handwritten syllabus -> formatted syllabus PDF | yes |
| `pages/exam-paper-maker` | handwritten question paper -> formatted exam paper PDF | yes |
| `pages/edit-pdf`, `pages/pdf-editor`, `pages/pdf-editor-full` | PDF editing tools | no |

Serve the folder over http/https (for example `npx serve`) - the Puter sign-in popup does not
work from a `file://` page. Internet needed.

## AI = Puter (one shared integration, no API keys)

Every AI page uses **Puter.js** through ONE shared file: `js/puter-ai.js` (styles: `css/puter-auth.css`).

- **No API key anywhere.** The visitor signs in once with a free Puter account (button on the page, or
  automatically when they press Convert). Puter's "user-pays" model means that visitor's own free
  monthly allowance pays for the AI - the site owner pays nothing.
- Images go straight to Puter. Nothing is uploaded to ImgBB or any other host any more.
- The model list lives in **one place**: `PUTER_MODELS` at the top of `js/puter-ai.js`.
  The first entry is the main model, the rest are automatic fallbacks:
  1. `google/gemini-3.5-flash-lite` - strong handwriting/OCR + layout for very little cost
  2. `openai/gpt-6-luna` 3. `anthropic/claude-haiku-5-5` 4. `qwen/qwen3.8-flash`
  (more at https://developer.puter.com/ai/models/ - ids look like `provider/model`)
- Failures are handled for all pages in the same way: busy server (wait + retry), dead model
  (next model), empty answer, not signed in, free allowance used up (clear message).

### What each AI page still owns (its own `js/config.js` and `js/convert-flow.js`)

- its prompt(s) - e.g. the exam and syllabus pages ask for a header only on image 1
- its image size / quality (`IMAGE_MAX_SIZE_PX`, `IMAGE_JPEG_QUALITY`) - e.g. Hindi syllabus uses 1600px
- its sanity check (the syllabus page re-asks once when the model "counts numbers by itself")
- its template / layout step (`exam-template.js`, `syllabus-template.js`)

### Adding Puter to a new page

1. In `<head>`: `<script src="https://js.puter.com/v2/"></script>` and `<link rel="stylesheet" href="../../css/puter-auth.css">`
2. In the page: the sign-in card (`#authCard`, `#puterSignInBtn`) and header button (`#accountBtn`) - copy them from `pages/hw-to-pdf/index.html`
3. Load `../../js/puter-ai.js` (after `utils.js`), then call `ensurePuterSignedIn()` inside the click handler,
   `prepareImagesForAi(images)` and `convertImagesToHtml(prepared, { getPrompt })` - see `pages/hw-to-pdf/js/main.js` and `convert-flow.js`.
