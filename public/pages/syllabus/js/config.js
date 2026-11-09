/* =========================================================
   config.js – every setting and constant in one place
   ========================================================= */

// ---------- Image picker ----------
const MAX_IMAGES = 3;               // maximum number of images the user can select

// (The AI connection - Puter sign-in, model list, retries - is shared by every page: ../../js/puter-ai.js)

// ---------- Prompts (handwritten syllabus -> syllabus_template rows) ----------
// The model does NOT design the page. It only transcribes the header and the subject rows into the HTML
// of syllabus_template.html (same CSS classes). syllabus-template.js then lays them out on A4 pages.
const CONVERSION_PROMPT_BASE = `Transcribe this handwritten syllabus page into HTML table rows. Use EXACTLY the CSS classes below (styling already exists). Never output <html>, <head>, <body>, <style>, scripts or a table heading row.

Wrap all rows in one <table class="syllabus-table"><tbody> ... </tbody></table>. One <tr> per subject, in the same order as the page:
<tr><td class="subject">English</td><td class="topics"><div class="line">Unit 1 - Reading comprehension, Grammar</div><div class="line">Unit 2 - Writing skills</div></td></tr>

Rules:
- The subject cell holds only the subject name (e.g. "Maths", "Hindi", "Art").
- Put the written lines of that subject in <div class="line"> elements, in the same order as written. Do NOT copy the handwriting's line breaks: the layout joins the lines into one paragraph and wraps only when the line is full. So never add or remove words to fit a line, and keep every item's wording exactly.
- Use <b>...</b> for a bold or underlined label inside a line (e.g. <div class="line"><b>Shading:</b> Fruits</div>).
- If one subject has two separate parts divided by a ruled line, give the line that starts the second part class="line divided".
- Hindi / Devanagari text: copy it exactly in Devanagari script.
- If a page begins with topic lines that continue a subject from the previous page (no subject name written), output that row with an EMPTY subject cell: <td class="subject"></td>.
- Copy wording, numbers and spellings exactly as written; do not invent, correct, translate or add anything.
- Ignore ruled/margin lines, page number, date box and paper background.
- This is a photo of an Indian school notebook page with English and Hindi mixed. Read slowly, word by word. Hindi pāṭh numbers, chapter numbers and short words are easy to misread: look at each one again.
- Write ONLY numbers and words that are visibly written. NEVER continue, complete or extend a number sequence: if the page shows "5, 6, 7" write exactly "5, 6, 7" and stop.
- Common subject names on such pages: Hindi I, Hindi II, English I, English II, Maths, Science, So. Science (Social Science), Computer, G.K (General Knowledge), Moral Value, Art, Drawing, Sanskrit. Use the name as written.
Output raw HTML only: no code fences, no explanation.`;

// FIRST image only: its header is used once, on page 1 of the final syllabus
const HEADER_PROMPT = `
This is the FIRST page. Before the table output the syllabus header exactly like this (keep each line as written; add or remove lines as needed; if the page has no such line, leave it out):
<header><div class="school-name">School name</div><div class="term-line">I Term Syllabus 2026-27</div><div class="class-line">Syllabus for class 4</div></header>`;

// Every other image: a continuation of the same syllabus
const CONTINUATION_PROMPT = `
This is a CONTINUATION page of the same syllabus. Do NOT output any header, even if the page shows one; output only the table rows.`;

// Added to the prompt when the first answer looks like a runaway number list (6, 7, 8, ... 100)
const RUNAWAY_RETRY_NOTE = `

IMPORTANT: your previous answer wrongly continued a number list far beyond what is written on the page. Look at the image again. Copy only the numbers that are really written (usually fewer than 10 per subject). Do not count upwards on your own.`;

// Prompt for the image at position `index` (0 = first image)
const getConversionPrompt = (index) =>
  CONVERSION_PROMPT_BASE + (index === 0 ? HEADER_PROMPT : CONTINUATION_PROMPT);

// ---------- Image compression (used before the image goes to the AI) ----------
const IMAGE_MAX_SIZE_PX = 1600;      // longest side after compression
const IMAGE_JPEG_QUALITY = 0.9;
