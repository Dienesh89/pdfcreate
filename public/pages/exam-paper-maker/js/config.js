
/* =========================================================
   config.js – every setting and constant in one place
   ========================================================= */

// ---------- Image picker ----------
const MAX_IMAGES = 3;               // maximum number of images the user can select

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

6) Draw ... (shapes, lines, pictures): students get a separate answer copy, so leave NO drawing space. Output only the instruction text as normal items: <div class="q-body"><div class="q-item">a) Square</div><div class="q-item">b) Triangle</div></div> (use items-2 / items-4 for short items). Never output draw-grid, draw-box or any empty box.

7) Write a table / write answers: students write in a separate copy, so output only the text, no dotted lines and no blank space: <div class="q-body items-2"><div class="q-item">Table of 15</div><div class="q-item">Table of 16</div></div>

8) MCQ / tick the correct option: the tick bracket goes at the END of every option and is ALWAYS exactly (&nbsp;&nbsp;&nbsp;) i.e. "(" + 3 spaces + ")" - never "( )" or "()". The template lines all brackets up vertically, so just keep the bracket last in the option:
   <div class="q-body"><div class="q-item">1) question</div><div class="options-row"><span>a) option (&nbsp;&nbsp;&nbsp;)</span><span>b) option (&nbsp;&nbsp;&nbsp;)</span></div><div class="options-row"><span>c) option (&nbsp;&nbsp;&nbsp;)</span><span>d) option (&nbsp;&nbsp;&nbsp;)</span></div> ...next question...</div>  (2 options per options-row; for a very long option use a single span in the row)

9) True/False: bracket is ALWAYS exactly (&nbsp;&nbsp;&nbsp;) (3 spaces inside) at the END of the statement; the template lines all brackets up vertically:
   <div class="q-body"><div class="tf-item">1) statement (&nbsp;&nbsp;&nbsp;)</div></div>
   (the student writes T or F inside the bracket - never fill it yourself)

10) Written answer questions (short / long answer, "write", "explain", etc.): students write in a separate copy, so output ONLY the question text as q-item. No ruled lines, no answer-lines, no empty space.

11) Jumbled words: <div class="jumbled-grid"><div>a) WORD</div><div>b) WORD</div></div>

12) Match the following:
   - If the matching has NO pictures/figures/symbols, use a plain text table with no icon cell and no empty space: <table class="match-table"><tr><td>a) text</td><td>1) text</td></tr></table>
   - ONLY if figures/pictures/diagrams are actually drawn in the paper, use: <table class="match-table"><tr><td class="icon-cell"><div class="icon-box">tiny inline SVG or symbol</div></td><td>a) text</td></tr></table>
   - Never output an empty icon-box or empty icon-cell.

13) Do NOT output diagram-space or any empty drawing space (separate answer copy is given).

Other short-answer questions: <div class="q-body"><div class="q-item">1) text</div><div class="q-item">2) text</div></div>

Rules:
- Copy question numbers, wording and marks exactly as written; do not invent, solve or add anything.
- Never put the answer into a blank, a calc box or a shape.
- ALWAYS include a q-marks span with a number in every q-head. If no marks are written on the page, put 0: <span class="q-marks">0</span> (the user edits it later). Never leave q-marks empty and never skip it.
- Ignore ruled/margin lines, page number, date box and paper background.
- Pictures that belong to a question: small inline SVG, black ink only.
- NO dotted lines anywhere: never output <span class="dots">, answer-lines, or any separator/border line after a question.
- NO answer space: never leave blank areas, empty boxes or extra gaps for writing (students use a separate answer copy). Inline blanks (<span class="blank"></span>) inside a sentence are fine.
- Keep line spacing minimum: no <br>, no empty <div>/<p>, no extra &nbsp; lines, no extra wrapper elements, no blank space between items.
Output raw HTML only: no code fences, no explanation.`;

// FIRST image only: its header is used once, on page 1 of the final paper
const HEADER_PROMPT = `
This is the FIRST page. Before the questions output the paper header exactly like this (keep each line as written; add or remove title lines as needed; ALWAYS output the Time line: if the page shows a time use it, otherwise use the placeholder "Time - 2 hours" (the user edits it later). If M.M is not shown leave it empty):
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
