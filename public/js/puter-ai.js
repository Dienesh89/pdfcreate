/* =========================================================
   puter-ai.js - ONE shared Puter integration for the whole site
   Used by: Handwritten to PDF, Syllabus Maker, Exam Paper Maker
   (loaded from every page with <script src="../../js/puter-ai.js">)

   Puter.js needs NO API key. The user signs in once with a free Puter account
   and that account's free monthly allowance pays for the AI ("user-pays" model),
   so the site owner pays nothing.

   Sections:  1. settings (model list)   2. image preparation
              3. sign-in / sign-out      4. image -> HTML conversion

   Each page only has to provide (in its own files):
     - the prompt(s)           -> pass  { getPrompt }  to convertImagesToHtml()
     - optional sanity check   -> pass  { looksWrong, retryNote }  (see convertImagesToHtml)
     - page globals used here: imageProcessingInfo, updateModalLoading, scrollModalto
       (modal.js), sleep, Alert (utils.js)
     - optional per-page image settings: IMAGE_MAX_SIZE_PX, IMAGE_JPEG_QUALITY
   And these elements in its HTML: #authCard, #puterSignInBtn, #accountBtn
   ========================================================= */

// =========================================================
// 1. Settings
// =========================================================

// Models are tried in this order. If one is unavailable the next one is used,
// and the model that worked is remembered for the remaining pages.
// All of them accept images and are cheap, so the free allowance lasts longer.
//   1. Gemini 3.5 Flash-Lite - best handwriting/OCR + layout quality per cost
//   2. GPT-6 Luna            - cheapest fallback
//   3. Claude Haiku 5.5      - fallback
//   4. Qwen3.8 Flash         - fallback
// Change the first entry to switch the main model for ALL pages
// (ids look like "provider/model", see https://developer.puter.com/ai/models/).
const PUTER_MODELS = [
  "google/gemini-3.5-flash-lite",
  "openai/gpt-6-luna",
  "anthropic/claude-haiku-5-5",
  "qwen/qwen3.8-flash"
];
const PUTER_MAX_OUTPUT_TOKENS = 8192;  // output cap per page
const PUTER_MAX_RETRIES = 3;           // retries (same model) after a busy-server / temporary error
const PUTER_RETRY_BASE_SEC = 6;        // wait 6s, 12s, 24s ... between those retries
const PUTER_REQUEST_TIMEOUT_SEC = 150; // give up on one request after this long
const OLD_GROQ_KEY_STORAGE_NAME = "groq_api_key"; // removed from the browser on start-up (clean-up only)

// Prepended to the hidden measuring iframes (exam-template.js / syllabus-template.js) so a
// scrollbar never takes width away from the A4 page and changes the measured heights.
const HIDE_SCROLLBARS_STYLE =
  "<style>html,body{scrollbar-width:none;-ms-overflow-style:none}" +
  "::-webkit-scrollbar{display:none;width:0;height:0}</style>";

// Used when a page passes no prompt of its own
const PUTER_DEFAULT_IMAGE_MAX_SIZE_PX = 1536;
const PUTER_DEFAULT_IMAGE_JPEG_QUALITY = 0.85;

// =========================================================
// 2. Image preparation: compress each image for the AI
//    Puter accepts the image directly (no upload to a third-party host needed).
//    Each image is returned in two forms so the converter can fall back:
//      file    -> a File object   (what puter.ai.chat() documents)
//      dataUrl -> "data:image/jpeg;base64,..." string
// =========================================================

// Decodes a File into something drawable. Tries 3 ways, because phone browsers are picky:
//   1. createImageBitmap (fast, low memory, applies the EXIF rotation)
//   2. <img> + object URL
//   3. <img> + data URL (works when the blob URL is rejected)
const loadDrawable = async (source) => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
      return { drawable: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close && bitmap.close() };
    } catch (e) {
      /* fall through to <img> */
    }
  }

  const loadImg = (url, revoke) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (revoke) URL.revokeObjectURL(url);
        resolve({
          drawable: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          release: () => {
            img.onload = img.onerror = null; // do NOT set src="" (that fires a fake error event)
            img.removeAttribute("src");
          }
        });
      };
      img.onerror = () => {
        if (revoke) URL.revokeObjectURL(url);
        reject(new Error("Image loading failed"));
      };
      img.src = url;
    });

  try {
    return await loadImg(URL.createObjectURL(source), true);
  } catch (e) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Image loading failed"));
      reader.readAsDataURL(source);
    });
    return await loadImg(dataUrl, false);
  }
};

// Shrinks one image (longest side = IMAGE_MAX_SIZE_PX) and returns { file, dataUrl }
const compressImage = async (source) => {
  const loaded = await loadDrawable(source);
  const { drawable, width, height } = loaded;
  if (!width || !height) {
    loaded.release();
    throw new Error("Image loading failed");
  }

  // Scale down only (never enlarge)
  // A page can set its own IMAGE_MAX_SIZE_PX / IMAGE_JPEG_QUALITY in its config.js
  const maxSizePx = typeof IMAGE_MAX_SIZE_PX === "number" ? IMAGE_MAX_SIZE_PX : PUTER_DEFAULT_IMAGE_MAX_SIZE_PX;
  const quality = typeof IMAGE_JPEG_QUALITY === "number" ? IMAGE_JPEG_QUALITY : PUTER_DEFAULT_IMAGE_JPEG_QUALITY;
  const scale = Math.min(1, maxSizePx / Math.max(width, height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff"; // white background (JPEG has no transparency)
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  loaded.release();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  // the pixels are no longer needed: give the memory back immediately (matters on phones)
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Image compression failed");

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { file: new File([blob], "page.jpg", { type: "image/jpeg" }), dataUrl };
};

// Main function: selected images -> array of { file, dataUrl } (same order)
// One image at a time: decoding many big phone photos in parallel runs the browser out of
// memory and makes images fail with "Image loading failed".
const prepareImagesForAi = async (images) => {
  const results = [];
  for (let index = 0; index < images.length; index++) {
    const item = images[index];
    let prepared;
    try {
      prepared = await compressImage(item.file ?? item);
    } catch (firstError) {
      // one retry after a short pause (lets the browser free memory)
      await new Promise((r) => setTimeout(r, 300));
      try {
        prepared = await compressImage(item.file ?? item);
      } catch (e) {
        const name = (item.file ?? item).name || `image ${index + 1}`;
        throw new Error(`Could not read "${name}". Please re-select it or use a JPG/PNG photo.`);
      }
    }
    // there is no upload step any more, so "compressed" and "ready" happen together
    if (imageProcessingInfo[index]) {
      imageProcessingInfo[index].isCompressed = true;
      imageProcessingInfo[index].isUploaded = true;
      updateModalLoading(imageProcessingInfo);
    }
    results.push(prepared);
  }
  return results;
};

// =========================================================
// 3. Sign-in / sign-out (replaces the old API-key card)
//    - "Sign in with Puter" button on the card, or automatically when the Convert button is pressed
//    - the card is hidden once signed in; the header shows a "Sign out" button instead
//    NOTE: the sign-in popup is only allowed right after a click/tap, so
//    ensurePuterSignedIn() must be called straight from a click handler.
// =========================================================

// true when the Puter.js script loaded (it can be blocked by an ad-blocker or be offline)
const isPuterLoaded = () =>
  typeof puter !== "undefined" && !!puter && !!puter.auth && !!puter.ai;

// Works whether isSignedIn() returns a boolean or a Promise
async function isPuterSignedIn() {
  try {
    let signedIn = puter.auth.isSignedIn();
    if (signedIn && typeof signedIn.then === "function") signedIn = await signedIn;
    return !!signedIn;
  } catch (err) {
    return false;
  }
}

// ---------- Visual feedback ----------

// Spinner on the sign-in button while the popup / sign-in is running
function setSignInBusy(isBusy) {
  const button = document.getElementById("puterSignInBtn");
  if (!button) return;
  button.classList.toggle("loading", isBusy);
  button.disabled = isBusy;
}

// Shows the card when signed out, the "Sign out" header button when signed in
async function refreshAuthUi() {
  const authCard = document.getElementById("authCard");
  const accountButton = document.getElementById("accountBtn");
  const signedIn = isPuterLoaded() && (await isPuterSignedIn());
  if (authCard) authCard.hidden = signedIn;
  if (accountButton) accountButton.hidden = !signedIn;

  if (signedIn && accountButton) {
    let name = "";
    try { name = (await puter.auth.getUser())?.username || ""; } catch (err) { /* name is optional */ }
    accountButton.title = name ? `Signed in as ${name}` : "Signed in";
    accountButton.setAttribute("aria-label", name ? `Sign out (${name})` : "Sign out");
  }
}

// ---------- Sign in / out ----------

let isSignInRunning = false;

// Returns true when the user is signed in (opens the Puter sign-in popup if needed).
// Shows an error alert and returns false when sign-in is impossible or cancelled.
async function ensurePuterSignedIn() {
  if (!isPuterLoaded()) {
    await Alert.fire({
      icon: "error",
      title: "Puter could not be loaded",
      text: "The AI service (Puter.js) is blocked or offline. Check your internet connection or ad-blocker and reload the page."
    });
    return false;
  }

  if (await isPuterSignedIn()) return true;
  if (isSignInRunning) return false;

  isSignInRunning = true;
  setSignInBusy(true);
  try {
    await puter.auth.signIn();
  } catch (err) {
    console.error("Puter sign-in failed:", err);
    setSignInBusy(false);
    isSignInRunning = false;
    await refreshAuthUi();
    await Alert.fire({
      icon: "info",
      title: "Sign-in not completed",
      text: "Please sign in with your free Puter account (or create one) to convert your pages. If no window opened, allow pop-ups for this site and try again."
    });
    return false;
  }
  setSignInBusy(false);
  isSignInRunning = false;

  const signedIn = await isPuterSignedIn();
  await refreshAuthUi();
  return signedIn;
}

async function signOutOfPuter() {
  try { await puter.auth.signOut(); } catch (err) { console.error(err); }
  await refreshAuthUi();
}

// ---------- Events ----------
function setupPuterAuthEvents() {
  // The old Groq key is useless now, so don't leave it in the browser
  try { localStorage.removeItem(OLD_GROQ_KEY_STORAGE_NAME); } catch (err) { /* storage blocked */ }

  const signInButton = document.getElementById("puterSignInBtn");
  const accountButton = document.getElementById("accountBtn");

  if (signInButton) signInButton.addEventListener("click", async () => {
    const signedIn = await ensurePuterSignedIn();
    if (signedIn) {
      Alert.fire({
        icon: "success",
        title: "Signed in",
        text: "You can now convert your handwritten pages.",
        timer: 1800,
        showConfirmButton: false
      });
    }
  });

  if (accountButton) accountButton.addEventListener("click", signOutOfPuter);
}

// =========================================================
// 4. Image -> HTML conversion
//    Sends each image to a vision model through Puter.js, one by one.
//    - the signed-in user's own Puter account pays (free monthly allowance)
//    - tries the models in PUTER_MODELS in order and remembers the one that works
//    - handles busy servers (retry with waiting), empty answers, sign-in and allowance problems
// =========================================================

const ORDINAL_NAMES = ["first", "second", "third", "fourth", "fifth"];

const OUT_OF_ALLOWANCE_MESSAGE =
  "Your free Puter allowance is used up. Add credit at puter.com or try again next month.";
const SIGN_IN_AGAIN_MESSAGE = "Please sign in with Puter again, then press Convert.";

// ---------- Reading the answer ----------

// puter.ai.chat() can answer in several shapes depending on the model:
//   a string | { message: { content: "text" } } | { message: { content: [{ type:"text", text }] } }
const extractModelText = (response) => {
  if (response === null || response === undefined) return "";
  if (typeof response === "string") return response;

  const content = response.message?.content ?? response.content ?? response.text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block === "string" ? block : block?.text || ""))
      .join("");
  }

  // ChatResponse objects print as their text
  const asText = typeof response.toString === "function" ? response.toString() : "";
  return asText && asText !== "[object Object]" ? asText : "";
};

// Removes <think> blocks, ``` code fences and any chatter around the HTML document
const cleanModelHtml = (text = "") => {
  let html = String(text)
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .trim();

  // answer wrapped in a ```html ... ``` block (possibly with sentences before / after it)
  const fenced = html.match(/```(?:html)?[ \t]*\r?\n?([\s\S]*?)```/i);
  if (fenced && /<[a-z!]/i.test(fenced[1])) {
    html = fenced[1].trim();
  } else {
    html = html.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  }

  // drop text before the document and after </html>
  const start = html.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) html = html.slice(start);
  const end = html.toLowerCase().lastIndexOf("</html>");
  if (end !== -1) html = html.slice(0, end + "</html>".length);

  html = html.trim();
  return /<[a-z!][^>]*>/i.test(html) ? html : ""; // no tag at all -> not a page
};

// ---------- Sorting errors ----------

// Puter rejects with different shapes ({ error: { code, message } }, { code, message }, a string ...)
// kind: "funds" (allowance used up) | "auth" (not signed in) | "retry" (busy / network, wait and
//       ask again) | "other" (this model / image format does not work -> try the next one)
const classifyPuterError = (err) => {
  const inner = err && typeof err.error === "object" && err.error ? err.error : err;
  const code = String(inner?.code ?? err?.code ?? "");
  const status = String(inner?.status ?? err?.status ?? err?.statusCode ?? "");
  let message = inner?.message ?? err?.message ?? (typeof err === "string" ? err : "");
  if (!message && err && typeof err === "object") {
    try { message = JSON.stringify(err); } catch (e) { /* ignore */ }
  }
  message = String(message || "Unknown error");

  const text = `${code} ${status} ${message}`.toLowerCase();
  let kind = "other";
  if (/insufficient|no.?funds|out of (?:credit|funds)|usage.?limit|quota|allowance|credit|payment|\b402\b/.test(text)) {
    kind = "funds";
  } else if (/auth|sign.?in|log.?in|unauthori[sz]ed|forbidden|\b401\b|\b403\b/.test(text)) {
    kind = "auth";
  } else if (/upstream_provider_unavailable|no.?implementation|not.?found|\b404\b|unsupported|model.*(?:invalid|not)/.test(text)) {
    kind = "other";
  } else if (/rate|too.?many|\b429\b|overload|busy|unavailable|\b50[0234]\b|\b529\b|time.?out|timed out|abort|network|fetch/.test(text)) {
    kind = "retry";
  }
  return { kind, code, message };
};

// ---------- One request ----------

// Every (model, image format) pair that can be tried, best first.
// "file" = File object, "dataUrl" = data:image/jpeg;base64 string.
const buildAttempts = () =>
  PUTER_MODELS.flatMap((model) => [
    { model, form: "file" },
    { model, form: "dataUrl" }
  ]);

// Sends ONE image (with its prompt) to ONE model. Resolves with the raw Puter answer, rejects on any error.
const requestPageConversion = async (model, media, prompt) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUTER_REQUEST_TIMEOUT_SEC * 1000);
  try {
    return await puter.ai.chat(prompt, media, {
      model,
      max_tokens: PUTER_MAX_OUTPUT_TOKENS,
      normalize: true, // same answer format for every vendor
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
};

// Small helper: change one image's "convert" status and redraw the modal
const setConvertStatus = (index, status) => {
  if (imageProcessingInfo[index]) {
    imageProcessingInfo[index].isConverted = status;
    updateModalLoading(imageProcessingInfo);
  }
};

// ---------- All images ----------

// Converts every image into HTML.
// `preparedImages` = [{ file, dataUrl }, ...] from prepareImagesForAi()
// `options` (all optional):
//   getPrompt(index) -> prompt text for the image at that position (default: CONVERSION_PROMPT)
//   looksWrong(html) -> true when an answer looks wrong (e.g. a runaway number list).
//                       The image is asked ONE more time with `retryNote` added to the prompt;
//                       if it still looks wrong the page is kept and its number goes to `suspicious`.
//   retryNote        -> text added to the prompt for that one extra try
// Returns: { done, processed, total, pages, suspicious, message }
//   pages = array of HTML strings in image order (failed pages are null)
const convertImagesToHtml = async (preparedImages, options = {}) => {
  const { getPrompt, looksWrong, retryNote = "" } = options;
  const total = preparedImages.length;
  const pages = [];
  const suspicious = []; // image numbers (1-based) whose answer still looks wrong after one retry
  const attempts = buildAttempts();
  let workingAttempt = 0; // index of the (model, format) that worked last -> start there next time

  // Builds the object returned to the caller
  const buildResult = (stoppedEarly, message, extra = {}) => ({
    done: !stoppedEarly && pages.length === total,
    processed: pages.length,
    total,
    pages,
    suspicious,
    message,
    ...extra
  });

  // Stops the whole run: marks this image (and every image not started yet) as failed
  const stopFrom = (index, message, skipLabel = "Skipped (stopped)") => {
    for (let k = index; k < total; k++) {
      setConvertStatus(k, [false, 0, 0, 0, k === index ? message : skipLabel]);
    }
    return buildResult(true, message);
  };

  for (let i = 0; i < total; i++) {
    const imageName = ORDINAL_NAMES[i] || i + 1;
    if (typeof scrollModalto === "function") scrollModalto(i); // keep the active card in view

    let attemptIndex = workingAttempt;
    let retryCount = 0;        // busy-server retries used for THIS image
    let lastError = "";
    let gotEmptyAnswer = false;
    let converted = false;
    let checkRetried = false;  // the one extra try when looksWrong() says the answer is bad
    let extraPrompt = "";

    while (attemptIndex < attempts.length) {
      const { model, form } = attempts[attemptIndex];
      const media = form === "file" ? preparedImages[i].file : preparedImages[i].dataUrl;
      const usingBackup = attemptIndex > workingAttempt;

      setConvertStatus(i, [
        "running",
        retryCount,
        PUTER_MAX_RETRIES,
        0,
        retryCount ? undefined : usingBackup ? "Trying another AI model…" : undefined
      ]);

      try {
        const defaultPrompt = typeof CONVERSION_PROMPT === "string" ? CONVERSION_PROMPT : ""; // only hw-to-pdf defines one
        const prompt = (getPrompt ? getPrompt(i) : defaultPrompt) + extraPrompt;
        const response = await requestPageConversion(model, media, prompt);
        const html = cleanModelHtml(extractModelText(response));

        if (html && looksWrong && looksWrong(html)) {
          if (!checkRetried) {
            checkRetried = true;
            extraPrompt = retryNote;
            continue; // ask once more, with a warning in the prompt
          }
          suspicious.push(i + 1); // still wrong: keep it, but let the page warn the user
        }

        if (html) {
          pages.push(html);
          setConvertStatus(i, [true]);
          workingAttempt = attemptIndex; // remember what worked
          converted = true;
          break;
        }

        // Empty / unusable answer -> try the next model
        gotEmptyAnswer = true;
        lastError = "The model returned an empty page";
        console.warn(`Image ${i + 1}: empty answer from ${model} (${form})`);
        attemptIndex++;
      } catch (err) {
        const { kind, message } = classifyPuterError(err);
        lastError = message;
        console.error(`Image ${i + 1} failed with ${model} (${form}) [${kind}]:`, err);

        if (kind === "funds") return stopFrom(i, OUT_OF_ALLOWANCE_MESSAGE, "Skipped (allowance used up)");
        if (kind === "auth") return stopFrom(i, SIGN_IN_AGAIN_MESSAGE, "Skipped (not signed in)");

        // Busy server / network hiccup -> wait and ask the same model again
        if (kind === "retry" && retryCount < PUTER_MAX_RETRIES) {
          retryCount++;
          const waitSec = PUTER_RETRY_BASE_SEC * 2 ** (retryCount - 1);
          console.log(`waiting ${waitSec} seconds to process ${imageName} image`);
          setConvertStatus(i, ["pending", retryCount, PUTER_MAX_RETRIES, waitSec, "AI service is busy"]);
          await sleep(waitSec * 1000);
          continue; // -> sends the same request again
        }

        // This model / image format does not work (or the retries are used up) -> next one
        attemptIndex++;
      }
    }

    if (!converted) {
      const shortMessage = gotEmptyAnswer
        ? "The model returned an empty page"
        : `Could not convert this image (${lastError.slice(0, 80)})`;

      // Every model failed with a real error and nothing has worked so far:
      // the service is down or offline, so don't grind through the remaining images.
      if (!gotEmptyAnswer && pages.every((page) => !page)) {
        return stopFrom(i, shortMessage, "Skipped (AI service unavailable)");
      }

      pages.push(null);
      setConvertStatus(i, [false, 0, 0, 0, shortMessage]);
    }
  }

  const failedCount = pages.filter((page) => !page).length;
  return buildResult(false, failedCount ? `${failedCount} image(s) failed.` : "All images converted.");
};
