let imageProcessingInfo = [];

  (function () {
    const overlay = document.getElementById('pmOverlay');
    const body = document.getElementById('pmBody');
    const sub = document.getElementById('pmSub');
    const DEFAULT_WAIT = 80; // 1m20s
    const state = {};        // imageNo -> { deadline }
    let ticker = null;
    let hideTimer = null;

    const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

    const STEPS = [
      { key: 'compress', label: 'Compressing image' },
      { key: 'upload', label: 'Preparing image' },
      { key: 'convert', label: 'Converting to HTML' }
    ];

    function iconHTML(st) {
      if (st === 'done') return '<div class="pm-chk">✓</div>';
      if (st === 'error') return '<div class="pm-x">✕</div>';
      if (st === 'active') return '<div class="pm-spinner"></div>';
      return '<div class="pm-dot"></div>';
    }

    function buildCard(n) {
      const card = document.createElement('div');
      card.className = 'pm-card';
      card.id = 'pm-img-' + n;
      card.innerHTML = '<h3>Image ' + n + '</h3>' + STEPS.map(s =>
        '<div class="pm-step pending" data-step="' + s.key + '">' +
        '<div class="pm-icon">' + iconHTML('pending') + '</div>' +
        '<div><span class="pm-label">' + s.label + '</span><span class="pm-note"></span></div>' +
        '</div>').join('');
      return card;
    }

    function setStep(card, key, st, noteHTML, noteCls) {
      const el = card.querySelector('[data-step="' + key + '"]');
      el.className = 'pm-step ' + st;
      el.querySelector('.pm-icon').innerHTML = iconHTML(st);
      const note = el.querySelector('.pm-note');
      note.className = 'pm-note ' + (noteCls || '');
      note.innerHTML = noteHTML || '';
    }

    function tick() {
      let any = false;
      for (const n in state) {
        const d = state[n].deadline;
        if (!d) continue;
        any = true;
        const card = document.getElementById('pm-img-' + (+n + 1));
        const el = card && card.querySelector('.cd');
        if (!el) { state[n].deadline = null; continue; }
        const left = (d - Date.now()) / 1000;
        if (left <= 0) {
          // time is up -> the converter is sending the request again right now
          state[n].deadline = null;
          setStep(card, 'convert', 'active', 'Retrying now…', 'warn');
        } else {
          el.textContent = fmt(left);
        }
      }
      if (!any) { clearInterval(ticker); ticker = null; }
    }
    function ensureTicker() { if (!ticker) ticker = setInterval(tick, 250); }

    /* ---------- Public API ---------- */

    window.showModal = function (noOfImages) {
      clearTimeout(hideTimer);
      document.getElementById('pmTitle').textContent = 'Processing images';
      Object.keys(state).forEach(k => delete state[k]);
      body.innerHTML = '';
      for (let i = 1; i <= noOfImages; i++) body.appendChild(buildCard(i));
      sub.textContent = noOfImages + (noOfImages === 1 ? ' image' : ' images') + ' · please keep this tab open';
      overlay.classList.add('show');
      requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('visible')));
    };

    window.dismissModal = function () {
      overlay.classList.remove('visible');
      hideTimer = setTimeout(() => {
        overlay.classList.remove('show');
        if (ticker) { clearInterval(ticker); ticker = null; }
      }, 250);
    };

    /**
     * showDownloadModal(pageCount, onDownload, onClose)
     * Turns the popup into the "PDF ready" state with a Download PDF button.
     */
    window.showDownloadModal = function (pageCount, onDownload, onClose) {
      clearTimeout(hideTimer);
      if (ticker) { clearInterval(ticker); ticker = null; }
      document.getElementById('pmTitle').textContent = 'PDF ready';
      sub.textContent = pageCount + (pageCount === 1 ? ' page' : ' pages') + ' converted';
      body.innerHTML =
        '<p class="pm-hint">Tap <b>Download PDF</b>, then choose <b>Save as PDF</b> as the destination.</p>' +
        '<div class="pm-actions">' +
        '<button type="button" class="pm-btn primary" id="pmDownloadBtn">Download PDF</button>' +
        '<button type="button" class="pm-btn" id="pmEditBtn"><i class="fa-solid fa-pen-to-square"></i> Edit PDF</button>' +
        '<button type="button" class="pm-btn" id="pmCloseBtn">Close</button>' +
        '</div>';
      document.getElementById('pmDownloadBtn').onclick = () => onDownload && onDownload();
      document.getElementById('pmEditBtn').onclick = () => {
        // hand the generated pages to the editor (only "Edit Text" can open them directly)
        let url = '../pdf-editor/index.html';
        try {
          if (window.lastGeneratedPages && window.lastGeneratedPages.length) {
            sessionStorage.setItem('pdfcreate.generatedPages', JSON.stringify(window.lastGeneratedPages));
            url += '?from=generated';
          }
        } catch (err) { console.error(err); }
        window.location.href = url;
      };
      document.getElementById('pmCloseBtn').onclick = () => {
        window.dismissModal();
        onClose && onClose();
      };
      overlay.classList.add('show');
      requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('visible')));
    };

    /**
     * scrollModalto(imageNo)
     * Smoothly scrolls the modal body so that the given image card is in view.
     */
    window.scrollModalto = function (imageNo) {
      const card = document.getElementById('pm-img-' + (imageNo + 1));
      if (!card) return;
      const top = card.offsetTop - body.offsetTop - 12;
      body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    };


    /**
     * updateModalLoading(imageProcessingInfo)
     *
     * imageProcessingInfo = [
     *   { isCompressed, isUploaded, isConverted: [status, retryCount, maxRetry, waitingTime] },  // imageNo 0
     *   { ... },                                                                                 // imageNo 1
     *   ...
     * ]
     *
     * status: 'nothing' | 'pending' | true | false
     */
    // updateModalLoading(imageProcessingInfo)
    window.updateModalLoading = function (imageProcessingInfo) {
      if (!Array.isArray(imageProcessingInfo)) return;

      imageProcessingInfo.forEach(function (info, imageNo) {
        const card = document.getElementById('pm-img-' + (imageNo + 1)); // cards start at 1
        if (!card || !info) return;

        const isCompressed = !!info.isCompressed;
        const isUploaded = !!info.isUploaded;
        const isConverted = info.isConverted;

        // 1) Compress
        setStep(card, 'compress', isCompressed ? 'done' : 'active');

        // 2) Upload
        setStep(card, 'upload', isUploaded ? 'done' : (isCompressed ? 'active' : 'pending'));

        // 3) Convert
        const arr = Array.isArray(isConverted) ? isConverted : [isConverted];
        const status = arr[0], retry = arr[1] || 0, max = arr[2] || 0;
        const wait = (arr[3] !== undefined && arr[3] !== null) ? Number(arr[3]) : DEFAULT_WAIT;

        state[imageNo] = state[imageNo] || {};

        if (status === true) {
          state[imageNo].deadline = null;
          setStep(card, 'convert', 'done');
        } else if (status === false) {
          state[imageNo].deadline = null;
          setStep(card, 'convert', 'error', arr[4] || 'Conversion failed. Please try again.', 'err');
        } else if (status === 'pending') {
          // waiting for a rate limit to reset -> countdown, then the converter retries
          state[imageNo].deadline = Date.now() + wait * 1000;
          const label = (arr[4] || 'Rate limit hit') + ' · Retry ' + retry + '/' + max;
          setStep(card, 'convert', 'active',
            label + '<br>Retrying in <b class="cd">' + fmt(wait) + '</b>', 'warn');
          ensureTicker();
        } else if (status === 'running') {
          // request is in flight (first try or a retry)
          state[imageNo].deadline = null;
          setStep(card, 'convert', 'active', retry ? 'Retry ' + retry + '/' + max + ' in progress…' : (arr[4] || ''), (retry || arr[4]) ? 'warn' : '');
        } else if (status === 'nothing') {
          state[imageNo].deadline = null;
          setStep(card, 'convert', 'pending');
        } else {
          state[imageNo].deadline = null;
          setStep(card, 'convert', isUploaded ? 'active' : 'pending');
        }
      });
    };
  })();

// ==================================================================================================

/**
 * updateModalLoading(imageNo, isCompressed, isUploaded, isConverted)
 * isConverted = [status, retryCount, maxRetry, waitingTime(seconds)]
 *   status: 'nothing' (conversion not started yet) | 'pending' (rate-limited, waiting to retry)
 *           | true (done) | false (limit reached)
 */

/**
  window.updateModalLoading = function (imageNo, isCompressed, isUploaded, isConverted) {
    const card = document.getElementById('pm-img-' + imageNo);
    if (!card) return;

    // 1) Compress
    setStep(card, 'compress', isCompressed ? 'done' : 'active');

    // 2) Upload
    setStep(card, 'upload', isUploaded ? 'done' : (isCompressed ? 'active' : 'pending'));

    // 3) Convert
    const arr = Array.isArray(isConverted) ? isConverted : [isConverted];
    const status = arr[0], retry = arr[1] || 0, max = arr[2] || 0;
    const wait = (arr[3] !== undefined && arr[3] !== null) ? Number(arr[3]) : DEFAULT_WAIT;

    state[imageNo] = state[imageNo] || {};

    if (status === true) {
      state[imageNo].deadline = null;
      setStep(card, 'convert', 'done');
    } else if (status === false) {
      state[imageNo].deadline = null;
      setStep(card, 'convert', 'error', 'Limit reached. Try again in ~2 minutes.', 'err');
    } else if (status === 'pending') {
      state[imageNo].deadline = Date.now() + wait * 1000;
      setStep(card, 'convert', 'active',
        'Rate limit hit · Retry ' + retry + '/' + max + '<br>Retrying in <b class="cd">' + fmt(wait) + '</b>', 'warn');
      ensureTicker();
    } else if (status === 'nothing') {
      // conversion has not started yet -> stays pending (dot, no spinner)
      state[imageNo].deadline = null;
      setStep(card, 'convert', 'pending');
    } else {
      // conversion running normally (no retry/wait yet)
      state[imageNo].deadline = null;
      setStep(card, 'convert', isUploaded ? 'active' : 'pending');
    }
  };
})();
**/
