/* =========================================================
   config.js – every setting and constant in one place
   ========================================================= */

// ---------- Image picker ----------
const MAX_IMAGES = 3;               // maximum number of images the user can select
const REMOVE_ANIMATION_MS = 400;    // slide-out (350ms) + collapse (300ms) animation time

// (The AI connection - Puter sign-in, model list, retries - is shared by every page: ../../js/puter-ai.js)

// ---------- Prompts (handwritten exam paper -> exam_template blocks) ----------
// The model does NOT design the page. It only transcribes the questions into the HTML blocks of
// exam_template.html (same CSS classes). exam-template.js then lays them out on A4 pages.
const CONVERSION_PROMPT_BASE = `Transcribe this handwritten exam question paper page into HTML blocks. Use EXACTLY the CSS classes below (styling already exists). Never output <html>, <head>, <body>, <style> or scripts.

One <div class="q-block"> per question, in the same order as the page:
<div class="q-block"><div class="q-head"><span class="q-title">Q1- Answer the following questions:-</span><span class="q-marks">(15)</span></div> BODY </div>

BODY by question type:
- Short answers: <div class="q-body"><div class="q-item">1) text</div><div class="q-item">2) text</div></div>
- MCQ / tick the correct option: <div class="q-body"><div class="q-item">1) question</div><div class="options-row"><span>a) option ( )</span><span>b) option ( )</span></div><div class="options-row"><span>c) option ( )</span><span>d) option ( )</span></div> ...next question...</div>  (2 options per options-row)
- Fill in the blanks: word bank goes inside the title as <span class="word-bank">[word, word]</span>; each blank is <span class="blank">&nbsp;</span>; items are <div class="q-item"> inside <div class="q-body">
- True/False: <div class="q-body"><div class="tf-item">1) statement ( )</div></div>
- Written answer with ruled space: <div class="answer-lines"><div class="line"></div><div class="line"></div></div> (one line per blank line left, max 6)
- Jumbled words: <div class="jumbled-grid"><div>a) WORD</div><div>b) WORD</div></div>
- Match the following: <table class="match-table"><tr><td class="icon-cell"><div class="icon-box">symbol, short text or tiny inline SVG</div></td><td>a) text</td></tr></table>
- Draw a diagram / empty drawing space: <div class="diagram-space"></div>

Rules:
- Copy question numbers, wording and marks exactly as written; do not invent, solve or add anything.
- If a question has no marks written, leave <span class="q-marks"></span> empty.
- Ignore ruled/margin lines, page number, date box and paper background.
- Handwritten line breaks are NOT meaningful: when a question, sentence or option runs onto the next handwritten line only because the paper line ended, join it into ONE q-item / ONE option. Never use <br>. Start a new q-item only where a new number/letter label starts.
- Pictures that belong to a question: inline SVG, black ink only, with a viewBox and a clearly visible size (about 120-200px wide, thick enough strokes), not tiny.
Output raw HTML only: no code fences, no explanation.`;

// FIRST image only: its header is used once, on page 1 of the final paper
const HEADER_PROMPT = `
This is the FIRST page. Before the questions output the paper header exactly like this (keep each line as written; add or remove title lines as needed):
<header class="header-grid"><div class="time">Time - 2.5hours</div><div class="titles"><div class="school-name">School name</div><div class="exam-title">I Term Examination 2026-27</div><div class="exam-class">Class - 4</div><div class="exam-subject">Sub- Computer</div></div><div class="mm">M.M - 70</div></header>
If the page has an instruction line (e.g. "Attempt all the Questions."), output it right after the header as <div class="instructions">text</div>.`;

// Every other image: a continuation of the same paper
const CONTINUATION_PROMPT = `
This is a CONTINUATION page of the same paper. Do NOT output any header or instruction line, even if the page shows one; output only the question blocks. If the page begins with the remaining items of a question that started on the previous page (no Q-heading on top), output them in a <div class=\"q-block\"><div class=\"q-body\">...</div></div> WITHOUT a q-head.`;

// Prompt for the image at position `index` (0 = first image)
const getConversionPrompt = (index) =>
  CONVERSION_PROMPT_BASE + (index === 0 ? HEADER_PROMPT : CONTINUATION_PROMPT);

// ---------- Image compression (used before the image goes to the AI) ----------
const IMAGE_MAX_SIZE_PX = 1536;      // longest side after compression
const IMAGE_JPEG_QUALITY = 0.85;
