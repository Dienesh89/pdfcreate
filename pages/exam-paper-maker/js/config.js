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
<div class="q-block"><div class="q-head"><span class="q-title">1. Answer the following questions:</span><span class="q-marks">4</span></div> BODY </div>
- Write the question number as written, followed by a dot ("1.", "6-A.", "10."). Marks go in q-marks as a bare number, no brackets.
- Sub-parts a) b) c) d) are items inside BODY. Never add a separate question for them.

CHOOSE THE BODY LAYOUT THAT MATCHES THE QUESTION:

1) Short items, laid out in columns (numbers, words, names, "write the number name", short form, place value):
   <div class="q-body items-2"> (2 columns; use items-4 for 4 very short items in one row)
     <div class="q-item">a) 325 : <span class="blank"></span></div> ...
   </div>
   - items to compare / encircle / arrange: add "spaced" -> <div class="q-body items-2 spaced"><div class="q-item">a) 729 890 872 463 172</div>...</div>
   - an underlined digit: <u>5</u>63 = <span class="blank"></span>
   - a blank to write in: <span class="blank"></span> (use <span class="blank short"></span> for a short one)

2) Sums written one under another (add / subtract / multiply, 2 numbers). ALWAYS use this for vertical working:
   <div class="calc-grid"><div class="calc"><div class="calc-top">65</div><div class="calc-op">+ 13</div></div> ... </div>
   - first line = top number, second line = operator + number (+, -, &times;)
   - "with carry / borrow / regrouping" questions: <div class="calc has-carry"> ... </div>
   - 4 sums per row automatically; put ALL sums of the question in one calc-grid.
   - if the sums are written side by side in a line like "32 + 18", still convert them to calc boxes.

3) Division sums: <div class="div-grid"><div class="div-item">a) 3 ) 15 (</div><div class="div-item">b) 7 ) 42 (</div></div>   (divisor ) number ( )

4) Divide / split / colour the figure (halves, quarters): one shape-row per sub-part, each with 3 shapes joined by arrows:
   <div class="shape-rows"><div class="shape-row"><b class="lbl">a)</b><span class="shape square"></span><span class="arrow">&rarr;</span><span class="shape square"></span><span class="arrow">&rarr;</span><span class="shape square"></span></div> ...</div>
   shape names: square, diamond, circle, rect (rectangle), triangle

5) Fill in the blanks with choices: <div class="q-body fill"><div class="q-item">1. The book is <span class="blank"></span> the table. <i class="opts">(on / in)</i></div> ...</div>
   (word bank for the whole question goes in the title as <span class="word-bank">[word, word]</span>)

6) Draw ... (shapes, lines, pictures): one empty box per item:
   <div class="draw-grid"><div class="draw-box">a) Square</div><div class="draw-box">b) Triangle</div></div>
   (use <div class="draw-box tall"> for a big drawing space, <div class="draw-box wide"> for a full-width box)

7) Write a table / write answers on lines: <div class="table-lines"><div class="tl"><b>Table of 15:</b><span class="dots"></span></div><div class="tl"><b>Table of 16:</b><span class="dots"></span></div></div>

8) MCQ / tick the correct option: <div class="q-body"><div class="q-item">1) question</div><div class="options-row"><span>a) option ( )</span><span>b) option ( )</span></div><div class="options-row"><span>c) option ( )</span><span>d) option ( )</span></div> ...next question...</div>  (2 options per options-row)

9) True/False: <div class="q-body"><div class="tf-item">1) statement ( )</div></div>

10) Written answer with ruled space: <div class="answer-lines"><div class="line"></div><div class="line"></div></div> (one line per blank line left, max 6)

11) Jumbled words: <div class="jumbled-grid"><div>a) WORD</div><div>b) WORD</div></div>

12) Match the following: <table class="match-table"><tr><td class="icon-cell"><div class="icon-box">symbol, short text or tiny inline SVG</div></td><td>a) text</td></tr></table>

13) Draw a diagram / empty drawing space: <div class="diagram-space"></div>

Other short-answer questions: <div class="q-body"><div class="q-item">1) text</div><div class="q-item">2) text</div></div>

Rules:
- Copy question numbers, wording and marks exactly as written; do not invent, solve or add anything.
- Never put the answer into a blank, a calc box or a shape.
- If a question has no marks written, leave <span class="q-marks"></span> empty.
- Ignore ruled/margin lines, page number, date box and paper background.
- Pictures that belong to a question: small inline SVG, black ink only.
Output raw HTML only: no code fences, no explanation.`;

// FIRST image only: its header is used once, on page 1 of the final paper
const HEADER_PROMPT = `
This is the FIRST page. Before the questions output the paper header exactly like this (keep each line as written; add or remove title lines as needed; leave time / mm empty if the page does not show them):
<header class="header-grid"><div class="time">Time - 2.5hours</div><div class="titles"><div class="school-name">School name</div><div class="exam-title">I Term Examination 2026-27</div><div class="exam-class">Class - 4</div><div class="exam-subject">Sub- Computer</div></div><div class="mm">M.M - 70</div></header>
If the page has an instruction line (e.g. "Attempt all the Questions."), output it right after the header as <div class="instructions">text</div>.
Do NOT output the Name / Roll No / Date box: the template adds it.`;

// Every other image: a continuation of the same paper
const CONTINUATION_PROMPT = `
This is a CONTINUATION page of the same paper. Do NOT output any header or instruction line, even if the page shows one; output only the question blocks.`;

// Prompt for the image at position `index` (0 = first image)
const getConversionPrompt = (index) =>
  CONVERSION_PROMPT_BASE + (index === 0 ? HEADER_PROMPT : CONTINUATION_PROMPT);

// ---------- Image compression (used before the image goes to the AI) ----------
const IMAGE_MAX_SIZE_PX = 1536;      // longest side after compression
const IMAGE_JPEG_QUALITY = 0.85;
