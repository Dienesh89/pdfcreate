/* PDF Create – Rotate PDF
   Preview: pdf.js   Export: pdf-lib (keeps text/vector; falls back to image for pages with a built-in /Rotate)
   Angle convention in the UI: positive = clockwise. */
(() => {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    '../../vendor/pdfjs/pdf.worker.min.js';

  const $ = (id) => document.getElementById(id);
  const el = {
    uploadCard: $('uploadCard'), dropzone: $('dropzone'), fileInput: $('fileInput'), emptyMsg: $('emptyMsg'),
    fileRow: $('fileRow'), fileName: $('fileName'), fileInfo: $('fileInfo'), removeBtn: $('removeBtn'),
    msg: $('msg'), editor: $('editor'),
    pager: $('pager'), prevBtn: $('prevBtn'), nextBtn: $('nextBtn'), pageInput: $('pageInput'), pageTotal: $('pageTotal'),
    stageWrap: $('stageWrap'), stage: $('stage'), content: $('content'),
    undoBtn: $('undoBtn'), redoBtn: $('redoBtn'),
    slider: $('angleSlider'), angleOut: $('angleOut'),
    zoomSlider: $('zoomSlider'), zoomOut: $('zoomOut'),
    rotLeft: $('rotLeft'), rotRight: $('rotRight'), resetBtn: $('resetBtn'),
    sizeSel: $('sizeSel'), orientSeg: $('orientSeg'), allChk: $('allChk'), fitChk: $('fitChk'),
    goBtn: $('goBtn'), flatChk: $('flatChk'),
    editToggle: $('editToggle'), editPanel: $('editPanel'), editHint: $('editHint'), editForm: $('editForm'),
    editSize: $('editSize'), editColor: $('editColor'),
    editRevert: $('editRevert'), editDelete: $('editDelete'), editDone: $('editDone'),
  };

  // Portrait sizes in PDF points
  const SIZES = {
    a3: [841.89, 1190.55],
    a4: [595.28, 841.89],
    a5: [419.53, 595.28],
    letter: [612, 792],
    legal: [612, 1008],
  };

  const state = {
    name: '',
    bytes: null,     // original PDF bytes (never modified)
    doc: null,       // pdf.js document
    pages: [],       // [{w, h, rot}] in points (w/h already include built-in rotation)
    tf: [],          // per page: { a: angle°, z: zoom, x, y } (x, y = shift as a fraction of page width/height)
    ppp: 1,          // preview pixels per PDF point
    cur: 0,
    orient: 'original',
    txt: [],         // per page: editable text lines (filled lazily)
    sel: null, canvas: null, cscale: 1, editing: false,
  };

  const undoStack = [];
  const redoStack = [];
  let pendingHistory = null;
  let historyTimer = null;
  let applyingHistory = false;
  let historyLocked = false;
  const HISTORY_LIMIT = 100;

  /* ---------- helpers ---------- */
  const norm = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  const round1 = (a) => Math.round(a * 10) / 10;
  const newTf = () => ({ a: 0, z: 1, x: 0, y: 0 });
  const T = (i) => state.tf[i] || newTf();
  const angle = (i) => T(i).a;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function showMsg(text) {
    el.msg.textContent = text || '';
    el.msg.hidden = !text;
  }
  const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  function historySnapshot() {
    return {
      tf: state.tf.map((t) => ({ ...t })),
      orient: state.orient,
      size: el.sizeSel.value,
      all: el.allChk.checked,
      fit: el.fitChk.checked,
      flat: el.flatChk.checked,
      txt: state.txt.map((lines) => lines?.map((line) => ({ ...line })) ?? null),
    };
  }

  function updateHistoryButtons() {
    el.undoBtn.disabled = !state.doc || (!undoStack.length && !pendingHistory);
    el.redoBtn.disabled = !state.doc || !redoStack.length;
  }

  function commitHistory() {
    clearTimeout(historyTimer);
    historyTimer = null;
    if (!pendingHistory) return;
    const snapshot = pendingHistory;
    pendingHistory = null;
    if (JSON.stringify(snapshot) !== JSON.stringify(historySnapshot())) {
      undoStack.push(snapshot);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
    }
    updateHistoryButtons();
  }

  function beginHistory() {
    if (applyingHistory || !state.doc) return;
    if (!pendingHistory) pendingHistory = historySnapshot();
    clearTimeout(historyTimer);
    if (!historyLocked) historyTimer = setTimeout(commitHistory, 500);
    updateHistoryButtons();
  }

  async function restoreHistory(snapshot) {
    applyingHistory = true;
    state.tf = snapshot.tf.map((t) => ({ ...t }));
    state.orient = snapshot.orient;
    state.txt = snapshot.txt.map((lines) => lines?.map((line) => ({ ...line })) ?? null);
    el.sizeSel.value = snapshot.size;
    el.allChk.checked = snapshot.all;
    el.fitChk.checked = snapshot.fit;
    el.flatChk.checked = snapshot.flat;
    setOrient(snapshot.orient);
    state.sel = null;
    syncControls();
    updatePreview();
    updateHistoryButtons();
    try {
      await showPage(state.cur);
    } finally {
      applyingHistory = false;
      updateHistoryButtons();
    }
  }

  el.undoBtn.addEventListener('click', async () => {
    commitHistory();
    const snapshot = undoStack.pop();
    if (!snapshot) return;
    redoStack.push(historySnapshot());
    await restoreHistory(snapshot);
  });
  el.redoBtn.addEventListener('click', async () => {
    commitHistory();
    const snapshot = redoStack.pop();
    if (!snapshot) return;
    undoStack.push(historySnapshot());
    await restoreHistory(snapshot);
  });

  /* ---------- geometry (shared by preview and export) ---------- */
  function targetSize(i) {
    const p = state.pages[i];
    const size = el.sizeSel.value;
    let W = p.w, H = p.h;
    if (size !== 'original') {
      [W, H] = SIZES[size];                       // portrait
      const wantLandscape =
        state.orient === 'landscape' || (state.orient === 'original' && p.w > p.h);
      if (wantLandscape) [W, H] = [H, W];
    } else {
      if (state.orient === 'portrait' && W > H) [W, H] = [H, W];
      if (state.orient === 'landscape' && H > W) [W, H] = [H, W];
    }
    return [W, H];
  }

  function layout(i, theta) {
    const p = state.pages[i];
    const [W, H] = targetSize(i);
    const b = Math.min(W / p.w, H / p.h);         // contain-fit when size/orientation differ
    const cw = p.w * b, ch = p.h * b;
    let f = 1;
    if (el.fitChk.checked) {
      const r = (theta * Math.PI) / 180;
      const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
      f = Math.min(1, W / (cw * c + ch * s), H / (cw * s + ch * c));
    }
    return { W, H, cw, ch, f };
  }

  /* ---------- loading ---------- */
  async function loadFile(file, hideLoading = null, opts = {}) {
    showMsg('');
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      showMsg('Please choose a PDF file.');
      return;
    }
    const stopLoading = hideLoading || window.pdfCreateDownload.showDelayedLoading('Reading PDF…');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        const vp = pg.getViewport({ scale: 1 });
        pages.push({ w: vp.width, h: vp.height, rot: ((pg.rotate % 360) + 360) % 360 });
      }
      if (state.doc) state.doc.destroy();
      Object.assign(state, {
        name: file.name, bytes, doc, pages,
        tf: pages.map(newTf), cur: 0, txt: [], sel: null, canvas: null,
      });
      clearTimeout(historyTimer);
      historyTimer = null;
      undoStack.length = 0;
      redoStack.length = 0;
      pendingHistory = null;
      historyLocked = false;
      updateHistoryButtons();
      resetEdit();
      el.fileName.textContent = file.name;
      el.fileInfo.textContent = `${pages.length} page${pages.length > 1 ? 's' : ''} · ${fmtSize(file.size)}`;
      el.emptyMsg.hidden = true;
      el.uploadCard.hidden = true;
      el.fileRow.hidden = false;
      el.editor.hidden = false;
      el.goBtn.disabled = false;
      el.sizeSel.value = 'original';
      setOrient('original');
      el.allChk.checked = true;
      el.fitChk.checked = true;
      syncControls();
      if (!opts.restore) startSession(file, bytes);   // this PDF is now the last opened one
      await showPage(0);
    } catch (err) {
      console.error(err);
      clearFile();
      showMsg(
        err && err.name === 'PasswordException'
          ? 'This PDF is password protected. Remove the password and try again.'
          : 'Could not open this PDF. The file may be damaged.'
      );
    } finally {
      stopLoading();
    }
  }

  function clearFile() {
    if (state.doc) state.doc.destroy();
    Object.assign(state, { name: '', bytes: null, doc: null, pages: [], tf: [], cur: 0, txt: [], sel: null, canvas: null });
    undoStack.length = 0;
    redoStack.length = 0;
    pendingHistory = null;
    clearTimeout(historyTimer);
    historyTimer = null;
    updateHistoryButtons();
    resetEdit();
    el.fileInput.value = '';
    el.fileRow.hidden = true;
    el.editor.hidden = true;
    el.emptyMsg.hidden = false;
    el.uploadCard.hidden = false;
    el.goBtn.disabled = true;
    el.content.replaceChildren();
  }

  /* ---------- preview ---------- */
  let renderTask = null;
  let renderToken = 0;

  async function showPage(i) {
    state.cur = i;
    state.canvas = null;
    select(null);
    el.content.querySelector('.ovl')?.remove();
    el.pageInput.value = i + 1;
    el.pageInput.max = state.pages.length;
    el.pageTotal.textContent = `/ ${state.pages.length}`;
    el.prevBtn.disabled = i === 0;
    el.nextBtn.disabled = i === state.pages.length - 1;
    el.pager.hidden = state.pages.length < 2;
    syncControls();
    updatePreview();

    const token = ++renderToken;
    el.stage.classList.add('loading');
    try {
      if (renderTask) { try { renderTask.cancel(); } catch (_) {} }
      const page = await state.doc.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      const cap = Math.min(window.innerWidth, window.innerHeight) < 700 ? 1100 : 1400;   // smaller canvas on phones = less RAM
      const scale = Math.min(3, cap / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      renderTask = page.render({ canvasContext: ctx, viewport: vp });
      await renderTask.promise;
      if (token !== renderToken) return;
      if (state.canvas && state.canvas !== c) state.canvas.width = state.canvas.height = 0;   // release the old page's pixels now
      el.content.replaceChildren(c);
      state.canvas = c;
      state.cscale = scale;
      buildOverlay();
    } catch (err) {
      if (!(err && err.name === 'RenderingCancelledException')) console.error(err);
    } finally {
      if (token === renderToken) el.stage.classList.remove('loading');
    }
  }

  function updatePreview() {
    if (!state.pages.length) return;
    const i = state.cur, t = T(i);
    const L = layout(i, t.a);
    const availW = Math.max(120, el.stageWrap.clientWidth - 16);
    const availH = Math.max(120, el.stageWrap.clientHeight - 16);   // the preview fills the free space
    const ppp = Math.min(availW / L.W, availH / L.H);   // screen px per PDF point
    state.ppp = ppp;
    el.stage.style.width = L.W * ppp + 'px';
    el.stage.style.height = L.H * ppp + 'px';
    el.content.style.width = L.cw * ppp + 'px';
    el.content.style.height = L.ch * ppp + 'px';
    el.content.style.setProperty('--k', (L.cw * ppp) / state.pages[i].w);   // preview px per PDF point
    el.content.style.transform =
      `translate(${t.x * L.W * ppp}px, ${t.y * L.H * ppp}px) translate(-50%, -50%) rotate(${t.a}deg) scale(${L.f * t.z})`;
    syncControls();
  }

  function syncControls() {
    const t = T(state.cur);
    el.slider.value = t.a;
    el.angleOut.textContent = `${t.a}°`;
    el.zoomSlider.value = t.z;
    el.zoomOut.textContent = `${Math.round(t.z * 100)}%`;
  }

  /* ---------- angle changes ---------- */
  // patch may hold any of a, z, x, y
  function setT(patch) {
    beginHistory();
    if (patch.a !== undefined) patch.a = round1(norm(patch.a));
    if (patch.z !== undefined) patch.z = clamp(Math.round(patch.z * 1000) / 1000, 0.25, 6);
    if (patch.x !== undefined) patch.x = clamp(patch.x, -1, 1);
    if (patch.y !== undefined) patch.y = clamp(patch.y, -1, 1);
    if (el.allChk.checked) state.tf.forEach((t) => Object.assign(t, patch));
    else Object.assign(state.tf[state.cur], patch);
    updatePreview();
  }
  const setAngle = (a) => setT({ a });

  el.slider.addEventListener('input', () => setAngle(parseFloat(el.slider.value)));
  el.zoomSlider.addEventListener('input', () => setT({ z: parseFloat(el.zoomSlider.value) }));
  el.rotLeft.addEventListener('click', () => setAngle(angle(state.cur) - 90));
  el.rotRight.addEventListener('click', () => setAngle(angle(state.cur) + 90));
  el.resetBtn.addEventListener('click', () => setT({ a: 0, z: 1, x: 0, y: 0 }));

  el.prevBtn.addEventListener('click', () => state.cur > 0 && showPage(state.cur - 1));
  el.nextBtn.addEventListener('click', () => state.cur < state.pages.length - 1 && showPage(state.cur + 1));

  // Jump to any page: type a number and press Enter / leave the field
  function jumpToTyped() {
    const n = parseInt(el.pageInput.value, 10);
    if (!Number.isFinite(n)) { el.pageInput.value = state.cur + 1; return; }
    const i = clamp(n, 1, state.pages.length) - 1;
    el.pageInput.value = i + 1;
    if (i !== state.cur) showPage(i);
  }
  el.pageInput.addEventListener('change', jumpToTyped);
  el.pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); jumpToTyped(); el.pageInput.blur(); }
  });
  el.pageInput.addEventListener('focus', () => el.pageInput.select());

  // Nudge buttons: tap = small step, hold = keeps moving
  const NUDGE_STEP = 0.005;     // one tap: 0.5% of the page
  const NUDGE_HOLD = 0.006;     // per tick while held (~15% of the page per second)
  const NUDGE_DELAY = 350;      // ms before repeating starts
  const NUDGE_TICK = 40;        // ms between repeats
  let nudgeDelay = null, nudgeTimer = null;

  function nudge(dx, dy, amt) {
    const t = T(state.cur);
    setT({ x: t.x + dx * amt, y: t.y + dy * amt });
  }
  function stopNudge() {
    clearTimeout(nudgeDelay);
    clearInterval(nudgeTimer);
    nudgeDelay = nudgeTimer = null;
  }
  document.querySelectorAll('.nudge').forEach((btn) => {
    const dx = +btn.dataset.dx, dy = +btn.dataset.dy;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      stopNudge();
      nudge(dx, dy, NUDGE_STEP);
      nudgeDelay = setTimeout(() => {
        nudgeTimer = setInterval(() => nudge(dx, dy, NUDGE_HOLD), NUDGE_TICK);
      }, NUDGE_DELAY);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, stopNudge));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    // keyboard (Enter / Space) fires click with detail 0
    btn.addEventListener('click', (e) => { if (e.detail === 0) nudge(dx, dy, NUDGE_STEP * 2); });
  });
  window.addEventListener('blur', stopNudge);

  [el.allChk, el.fitChk, el.sizeSel, el.flatChk].forEach((control) => {
    control.addEventListener('pointerdown', beginHistory);
    control.addEventListener('keydown', beginHistory);
  });
  el.allChk.addEventListener('change', () => {
    beginHistory();
    if (el.allChk.checked) {
      const c = state.tf[state.cur];
      state.tf.forEach((t) => Object.assign(t, c));
    }
    updatePreview();
  });
  el.fitChk.addEventListener('change', () => { beginHistory(); updatePreview(); });
  el.sizeSel.addEventListener('change', () => { beginHistory(); updatePreview(); });
  el.flatChk.addEventListener('change', beginHistory);

  function setOrient(v) {
    state.orient = v;
    el.orientSeg.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.v === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });
  }
  el.orientSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    beginHistory();
    setOrient(b.dataset.v);
    updatePreview();
  });

  window.addEventListener('resize', updatePreview);
  // The preview area changes size when the tool panel or the keyboard changes
  if ('ResizeObserver' in window) new ResizeObserver(() => updatePreview()).observe(el.stageWrap);

  /* ---------- bottom tool tabs (one tool panel at a time, no scrolling) ---------- */
  const tabs = [...document.querySelectorAll('.tab')];
  const panels = [...document.querySelectorAll('.tool-panel')];
  function setTab(name) {
    tabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on);
    });
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    // Text editing is only active while the Text tab is open
    const editing = el.editToggle.getAttribute('aria-pressed') === 'true';
    if ((name === 'text') !== editing) el.editToggle.click();
  }
  tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  el.removeBtn.addEventListener('click', () => setTab('rotate'));

  /* ---------- gestures ----------
     1 finger / mouse drag  -> move the content
     2 fingers              -> twist = rotate, pinch = zoom, moving both = move  */
  const pointers = new Map();
  let tap = null;  // single-finger tap candidate (used to pick text in edit mode)
  let g = null;   // snapshot taken whenever the number of pointers changes

  function beginGesture() {
    const pts = [...pointers.values()];
    const t = T(state.cur);
    if (pts.length === 1) {
      g = { n: 1, px: pts[0].x, py: pts[0].y, t: { ...t } };
    } else if (pts.length >= 2) {
      const [p, q] = pts;
      g = {
        n: 2,
        ang: Math.atan2(q.y - p.y, q.x - p.x),
        dist: Math.hypot(q.x - p.x, q.y - p.y) || 1,
        mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2,
        t: { ...t },
      };
    } else g = null;
    el.stage.classList.toggle('active', !!g);
  }

  el.stage.addEventListener('pointerdown', (e) => {
    if (state.editing) return;   // gestures are locked while editing text
    historyLocked = true;
    beginHistory();
    el.stage.setPointerCapture(e.pointerId);
    if (!pointers.size) tap = { x: e.clientX, y: e.clientY, ok: true }; else if (tap) tap.ok = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    beginGesture();
  });

  el.stage.addEventListener('pointermove', (e) => {
    if (state.editing) return;
    if (tap && tap.ok && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.ok = false;
    if (!pointers.has(e.pointerId) || !g) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    const [W, H] = targetSize(state.cur);
    const sw = W * state.ppp, sh = H * state.ppp;   // stage size in screen px
    if (g.n === 1 || pts.length < 2) {
      if (g.n !== 1) return;
      setT({ x: g.t.x + (pts[0].x - g.px) / sw, y: g.t.y + (pts[0].y - g.py) / sh });
    } else {
      const [p, q] = pts;
      const ang = Math.atan2(q.y - p.y, q.x - p.x);
      const dist = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      setT({
        a: g.t.a + ((ang - g.ang) * 180) / Math.PI,
        z: g.t.z * (dist / g.dist),
        x: g.t.x + (mx - g.mx) / sw,
        y: g.t.y + (my - g.my) / sh,
      });
    }
  });

  const endPointer = (e) => {
    if (state.editing) return;
    const wasTap = e.type === 'pointerup' && tap && tap.ok && pointers.size === 1;
    pointers.delete(e.pointerId);
    beginGesture();
    if (!pointers.size) {
      if (wasTap) tapAt(e.clientX, e.clientY);
      tap = null;
      historyLocked = false;
      commitHistory();
    }
  };
  el.stage.addEventListener('pointerup', endPointer);
  el.stage.addEventListener('pointercancel', endPointer);

  // Desktop: Ctrl+wheel (or trackpad pinch) zooms, Shift+wheel rotates
  el.stage.addEventListener('wheel', (e) => {
    if (state.editing) return;
    if (e.ctrlKey) {
      e.preventDefault();
      setT({ z: T(state.cur).z * (e.deltaY > 0 ? 0.95 : 1.05) });
    } else if (e.shiftKey) {
      e.preventDefault();
      setAngle(angle(state.cur) + (e.deltaY > 0 ? 1 : -1));
    }
  }, { passive: false });

  /* ---------- text editing ---------- */
  const PAD = 0.06;   // box padding, as a fraction of the font size
  const CSS = { sans: 'Arial, "Noto Sans", sans-serif', serif: '"Times New Roman", "Noto Serif", serif', mono: '"Courier New", monospace' };
  const STD = {   // regular, bold, italic, bold italic
    sans: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'],
    serif: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'],
    mono: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'],
  };
  const hex2 = (v) => v.toString(16).padStart(2, '0');
  const rgbOf = (h) => PDFLib.rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  // Box of a text line in page points (y down, top-left origin)
  const boxOf = (l) => {
    const p = l.fs * PAD;
    return { x: l.x - p, y: l.y - l.asc * l.fs - p, w: l.w + 2 * p, h: (l.asc + l.desc) * l.fs + 2 * p };
  };

  function resetEdit() {
    state.editing = false;
    el.stage.classList.remove('editing');
    el.editPanel.hidden = true;
    el.editToggle.classList.remove('on');
    el.editToggle.setAttribute('aria-pressed', 'false');
    setLock(false);
  }

  async function extractLines(i) {
    if (state.txt[i]) return state.txt[i];
    const page = await state.doc.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const lines = [];
    let last = null;
    for (const it of tc.items) {
      if (!it.str) continue;
      const m = pdfjsLib.Util.transform(vp.transform, it.transform);
      const fs = Math.hypot(m[2], m[3]);
      if (!fs || Math.abs(Math.atan2(m[1], m[0])) > 0.02) { last = null; continue; }   // horizontal text only
      const gap = last ? m[4] - (last.x + last.w) : 0;
      if (last && last.fn === it.fontName && Math.abs(fs - last.fs) < 0.5 && Math.abs(m[5] - last.y) < 0.3 * fs && gap > -0.3 * fs && gap < 0.8 * fs) {
        if (gap > 0.15 * fs && !/\s$/.test(last.text) && !/^\s/.test(it.str)) last.text += ' ';
        last.text += it.str;
        last.w = m[4] + it.width - last.x;
        continue;
      }
      const st = tc.styles[it.fontName] || {};
      let nm = '';
      try { nm = page.commonObjs.get(it.fontName).name || ''; } catch (_) {}
      const mono = /mono|courier|consolas/i.test(nm) || st.fontFamily === 'monospace';
      const sans = /sans|arial|helvet|calibri|verdana|tahoma|roboto|noto|dejavu/i.test(nm);
      const serif = /times|serif|georgia|garamond|cambria|palatino|minion|roman|book/i.test(nm) || st.fontFamily === 'serif';
      last = {
        x: m[4], y: m[5], w: it.width, fs, fn: it.fontName, text: it.str,
        asc: clamp(st.ascent ?? 0.8, 0.6, 0.95), desc: clamp(Math.abs(st.descent ?? -0.2), 0.12, 0.3),
        bold: /bold|black|heavy|demi/i.test(nm), italic: /italic|oblique/i.test(nm),
        fam: mono ? 'mono' : sans ? 'sans' : serif ? 'serif' : 'sans',
      };
      lines.push(last);
    }
    lines.forEach((l) => Object.assign(l, { orig: l.text, size: l.fs, dirty: false, bg: null, color: null, color0: null }));
    return (state.txt[i] = lines.filter((l) => l.text.trim()));
  }

  // Background = most common colour in the box, text colour = the pixel furthest from it
  function sample(l) {
    if (l.bg) return;
    l.bg = '#ffffff';
    l.color = l.color0 = '#000000';
    const c = state.canvas;
    if (!c) return;
    const k = state.cscale, b = boxOf(l);
    const x = Math.max(0, Math.floor(b.x * k)), y = Math.max(0, Math.floor(b.y * k));
    const w = Math.min(c.width - x, Math.ceil(b.w * k)), h = Math.min(c.height - y, Math.ceil(b.h * k));
    if (w < 1 || h < 1) return;
    const d = c.getContext('2d').getImageData(x, y, w, h).data;
    const cnt = new Map();
    let top = null;
    for (let p = 0; p < d.length; p += 4) {
      const key = ((d[p] >> 3) << 10) | ((d[p + 1] >> 3) << 5) | (d[p + 2] >> 3);
      const e = cnt.get(key) || [0, d[p], d[p + 1], d[p + 2]];
      e[0]++;
      cnt.set(key, e);
      if (!top || e[0] > top[0]) top = e;
    }
    l.bg = '#' + [top[1], top[2], top[3]].map(hex2).join('');
    let far = -1, fc = [0, 0, 0];
    for (let p = 0; p < d.length; p += 4) {
      const dist = (d[p] - top[1]) ** 2 + (d[p + 1] - top[2]) ** 2 + (d[p + 2] - top[3]) ** 2;
      if (dist > far) { far = dist; fc = [d[p], d[p + 1], d[p + 2]]; }
    }
    l.color = l.color0 = far > 1500 ? '#' + fc.map(hex2).join('') : '#000000';
  }

  function paintBox(d, l) {
    const st = d.style, show = l.dirty || d.classList.contains('act');
    d.classList.toggle('mod', l.dirty);
    if (!show) d.textContent = '';
    else if (d.textContent !== l.text) d.textContent = l.text;   // keeps the caret while typing
    st.background = show ? l.bg : '';
    st.color = l.color || '#000';
    st.fontFamily = CSS[l.fam];
    st.fontWeight = l.bold ? '700' : '400';
    st.fontStyle = l.italic ? 'italic' : 'normal';
    st.fontSize = `calc(var(--k) * ${l.size}px)`;
    st.paddingLeft = `calc(var(--k) * ${l.fs * PAD}px)`;
  }

  async function buildOverlay() {
    const i = state.cur;
    if (!state.canvas || (!state.editing && !state.txt[i])) return;
    const lines = await extractLines(i);
    if (i !== state.cur || !state.canvas || !el.content.contains(state.canvas)) return;
    el.content.querySelector('.ovl')?.remove();
    const p = state.pages[i], ovl = document.createElement('div');
    ovl.className = 'ovl';
    lines.forEach((l, n) => {
      const b = boxOf(l), d = document.createElement('div');
      d.className = 'tb';
      d.dataset.n = n;
      d.spellcheck = false;
      if (state.editing) {
        d.contentEditable = 'plaintext-only';
        if (d.contentEditable !== 'plaintext-only') d.contentEditable = 'true';
      }
      Object.assign(d.style, {
        left: (b.x / p.w) * 100 + '%', top: (b.y / p.h) * 100 + '%',
        minWidth: (b.w / p.w) * 100 + '%', height: (b.h / p.h) * 100 + '%',
        lineHeight: `calc(var(--k) * ${b.h}px)`,
      });
      paintBox(d, l);
      ovl.appendChild(d);
    });
    el.content.appendChild(ovl);
  }

  const curLine = () => (state.sel == null ? null : state.txt[state.cur][state.sel]);
  const curBox = () => el.content.querySelector(`.tb[data-n="${state.sel}"]`);

  function select(n) {
    state.sel = n;
    el.content.querySelectorAll('.tb.sel').forEach((d) => d.classList.remove('sel'));
    const l = n == null ? null : state.txt[state.cur][n];
    el.editForm.hidden = !l;
    el.editHint.hidden = !!l;
    if (!l) return;
    sample(l);
    curBox()?.classList.add('sel');
    el.editSize.value = round1(l.size);
    el.editColor.value = l.color;
  }

  function tapAt(x, y) {
    if (!state.editing) return;
    const d = document.elementFromPoint(x, y)?.closest('.tb');
    select(d ? +d.dataset.n : null);
  }

  function touch(fn) {
    const l = curLine();
    if (!l) return;
    beginHistory();
    fn(l);
    l.dirty = true;
    const d = curBox();
    if (d) paintBox(d, l);
  }
  el.editSize.addEventListener('input', () => touch((l) => { l.size = clamp(parseFloat(el.editSize.value) || l.fs, 2, 300); }));
  el.editColor.addEventListener('input', () => touch((l) => { l.color = el.editColor.value; }));
  el.editDelete.addEventListener('click', () => { touch((l) => { l.text = ''; }); });
  el.editDone.addEventListener('click', () => { document.activeElement?.blur(); select(null); });
  el.editRevert.addEventListener('click', () => {
    const l = curLine();
    if (!l) return;
    beginHistory();
    Object.assign(l, { text: l.orig, size: l.fs, color: l.color0, dirty: false });
    paintBox(curBox(), l);
    select(state.sel);
  });
  el.editToggle.addEventListener('click', () => {
    state.editing = !state.editing;
    el.editToggle.classList.toggle('on', state.editing);
    el.editToggle.setAttribute('aria-pressed', state.editing);
    el.stage.classList.toggle('editing', state.editing);
    el.editPanel.hidden = !state.editing;
    setLock(state.editing);
    document.activeElement?.blur();
    select(null);
    buildOverlay();
  });

  // Click straight into a line to type. The original text is covered as soon as you click it.
  const boxLine = (d) => state.txt[state.cur][+d.dataset.n];
  const boxOfEvent = (e) => (state.editing && e.target.closest ? e.target.closest('.tb') : null);
  function activate(d) {
    const l = boxLine(d);
    sample(l);
    d.classList.add('act');
    paintBox(d, l);
  }
  el.content.addEventListener('pointerdown', (e) => { const d = boxOfEvent(e); if (d) activate(d); }, true);
  el.content.addEventListener('focusin', (e) => {
    const d = boxOfEvent(e);
    if (d) {
      historyLocked = true;
      beginHistory();
      activate(d);
      select(+d.dataset.n);
    }
  });
  el.content.addEventListener('input', (e) => {
    const d = boxOfEvent(e);
    if (!d) return;
    const l = boxLine(d);
    l.text = d.textContent;
    l.dirty = true;
    d.classList.add('mod');
  });
  el.content.addEventListener('keydown', (e) => {
    if (boxOfEvent(e) && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
  el.content.addEventListener('focusout', (e) => {
    const d = boxOfEvent(e);
    if (!d) return;
    const l = boxLine(d);
    l.text = d.textContent;
    l.dirty = l.text !== l.orig || l.size !== l.fs || l.color !== l.color0;
    d.classList.remove('act');
    paintBox(d, l);
    historyLocked = false;
    commitHistory();
  });

  // While editing text, move / zoom / rotate are switched off
  function setLock(on) {
    [el.slider, el.zoomSlider, el.rotLeft, el.rotRight, el.resetBtn, ...document.querySelectorAll('.nudge')].forEach((b) => { b.disabled = on; });
    const hint = document.querySelector('.hint');
    if (hint) {
      hint.dataset.t = hint.dataset.t || hint.textContent;
      hint.textContent = on ? 'Move, zoom and rotate are locked while you edit text' : hint.dataset.t;
    }
  }

  // Text that standard PDF fonts cannot encode (e.g. Hindi) is drawn as an image
  async function textImage(out, l) {
    const K = 4, px = l.size * K, a = l.asc * px, dsc = l.desc * px;
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    const f = `${l.italic ? 'italic ' : ''}${l.bold ? 'bold ' : ''}${px}px ${CSS[l.fam]}`;
    ctx.font = f;
    const tw = ctx.measureText(l.text).width;
    c.width = Math.ceil(tw) + 4;
    c.height = Math.ceil(a + dsc) + 4;
    ctx.font = f;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, 2, a + 2);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const cw = c.width, ch = c.height;
    c.width = c.height = 0;
    return { emb: await out.embedPng(new Uint8Array(await blob.arrayBuffer())), w: cw / K, h: ch / K, off: (dsc + 2) / K, pad: 2 / K, tw: tw / K };
  }

  // Draws the edits in page-point units, using the same placement as the page itself
  async function drawEdits(out, page, i, lines, x, y, s, phi, fonts) {
    const { pushGraphicsState, popGraphicsState, concatTransformationMatrix } = PDFLib;
    const ph = state.pages[i].h, cs = Math.cos(phi), sn = Math.sin(phi);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(s * cs, s * sn, -s * sn, s * cs, x, y));
    for (const l of lines) {
      const b = boxOf(l), base = ph - l.y, pad = l.fs * PAD;
      let font = null, img = null, tw = 0;
      if (l.text.trim()) {
        const key = STD[l.fam][(l.bold ? 1 : 0) + (l.italic ? 2 : 0)];
        if (!fonts.has(key)) fonts.set(key, await out.embedFont(PDFLib.StandardFonts[key]));
        font = fonts.get(key);
        try { tw = font.widthOfTextAtSize(l.text, l.size); } catch (_) { font = null; }
        if (!font) { img = await textImage(out, l); tw = img.tw; }
      }
      page.drawRectangle({
        x: b.x, y: ph - b.y - b.h,
        width: Math.max(b.w, tw + 2 * pad), height: Math.max(b.h, (l.asc + l.desc) * l.size + 2 * pad),
        color: rgbOf(l.bg),
      });
      if (font) page.drawText(l.text, { x: l.x, y: base, size: l.size, font, color: rgbOf(l.color) });
      else if (img) page.drawImage(img.emb, { x: l.x - img.pad, y: base - img.off, width: img.w, height: img.h });
    }
    page.pushOperators(popGraphicsState());
  }

  /* ---------- upload ---------- */
  el.fileInput.addEventListener('change', () => loadFile(el.fileInput.files[0]));
  el.removeBtn.addEventListener('click', () => { clearFile(); forgetSession(); });

  ['dragenter', 'dragover'].forEach((t) =>
    el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) =>
    el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.classList.remove('over'); }));
  el.dropzone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

  /* ---------- keep the last opened PDF + edits in this browser ----------
     Stored on this device only (IndexedDB). Restored on refresh / re-open, whether the editor is
     opened from the features page or from a download popup. */
  const session = window.pdfEditorSession;
  let sessionFileId = null;   // id of the saved original PDF; null = nothing is being auto-saved
  let savedSig = '';

  function startSession(file, bytes) {
    sessionFileId = session.newId();
    const rec = sessionRecord();
    savedSig = sessionSig(rec);
    session.save([
      { key: 'full-file', fileId: sessionFileId, name: file.name, blob: new Blob([bytes], { type: 'application/pdf' }) },
      rec,
    ]);
  }

  function sessionRecord() {
    return { key: 'full', fileId: sessionFileId, name: state.name, cur: state.cur, snapshot: historySnapshot(), savedAt: Date.now() };
  }
  const sessionSig = (rec) => JSON.stringify({ ...rec, savedAt: 0 });

  function persistState() {
    if (!state.doc || !sessionFileId || applyingHistory) return;
    const rec = sessionRecord();
    const sig = sessionSig(rec);
    if (sig === savedSig) return;      // nothing changed since the last save
    savedSig = sig;
    session.save(rec);
  }
  setInterval(persistState, 1500);     // catches every kind of edit (rotate, zoom, size, text...)
  session.onLeave(persistState);

  function forgetSession() {
    sessionFileId = null;
    savedSig = '';
    session.clear(['full', 'full-file']);
  }

  async function restoreLastSession() {
    const [meta, fileRec] = await Promise.all([session.load('full'), session.load('full-file')]);
    if (!meta || !fileRec || meta.fileId !== fileRec.fileId || !(fileRec.blob instanceof Blob)) return false;

    showMsg('Opening your last PDF…');
    const hideLoading = window.pdfCreateDownload.showDelayedLoading('Reading PDF…');
    sessionFileId = null;              // do not auto-save over the stored edits until they are applied
    try {
      await loadFile(new File([fileRec.blob], fileRec.name || 'document.pdf', { type: 'application/pdf' }), hideLoading, { restore: true });
      if (!state.doc) return false;
      const snap = meta.snapshot;
      if (snap && Array.isArray(snap.tf) && snap.tf.length === state.pages.length) {
        state.cur = clamp(meta.cur | 0, 0, state.pages.length - 1);
        await restoreHistory(snap);
      }
      sessionFileId = fileRec.fileId;
      savedSig = sessionSig(sessionRecord());
      showMsg('');
      session.notify('Restored your last PDF with your edits');
      return true;
    } finally {
      hideLoading();
    }
  }

  // returns true when a generated PDF was found (and opened or failed), false when there is none
  async function openGeneratedPdf() {
    if (new URLSearchParams(location.search).get('generated') !== '1') return false;

    let pages, name = 'document';
    try {
      pages = JSON.parse(sessionStorage.getItem('pdfcreate.generatedPages') || 'null');
      name = sessionStorage.getItem('pdfcreate.generatedName') || name;
    } catch (err) {
      console.error(err);
      return false;
    }
    if (!Array.isArray(pages) || pages.length === 0) return false;   // e.g. page was refreshed

    showMsg('Preparing your PDF…');
    const hideLoading = window.pdfCreateDownload.showDelayedLoading('Reading PDF…');
    try {
      const pdf = await window.pdfCreateDownload.createPdf(pages, name);
      await loadFile(new File([pdf], `${name || 'document'}.pdf`, { type: 'application/pdf' }), hideLoading);
      if (state.doc) {
        sessionStorage.removeItem('pdfcreate.generatedPages');
        sessionStorage.removeItem('pdfcreate.generatedName');
      }
    } catch (err) {
      console.error(err);
      showMsg(err.message || 'Could not prepare the generated PDF. Please try again.');
    } finally {
      hideLoading();
    }
    return true;
  }

  async function openTransferredPdf() {
    const transferId = new URLSearchParams(location.search).get('transfer');
    if (!transferId) return false;

    try {
      const transfer = await window.pdfCreateDownload.getPdfTransfer(transferId);
      if (!transfer || !(transfer.file instanceof Blob)) return false;   // already used (page refreshed)
      showMsg('Opening your PDF…');
      await loadFile(new File([transfer.file], transfer.name || 'document.pdf', { type: 'application/pdf' }));
      if (state.doc) await window.pdfCreateDownload.removePdfTransfer(transferId);
    } catch (err) {
      console.error(err);
      showMsg(err.message || 'Could not open the transferred PDF.');
    }
    return true;
  }

  (async function openInitialPdf() {
    if (await openGeneratedPdf()) return;
    if (await openTransferredPdf()) return;
    let restored = false;
    try { restored = await restoreLastSession(); } catch (err) { console.error(err); }
    if (!restored) {
      const qs = new URLSearchParams(location.search);
      if (qs.get('generated') === '1') showMsg('No generated PDF found. Please go back and generate it again.');
      else if (qs.get('transfer')) showMsg('The transferred PDF could not be found. Please upload it again.');
      else if (!state.doc) showMsg('');
    }
  })();

  /* ---------- hidden source HTML (written by pdf-export.js) ----------
     PDFs made by PDF Create carry their HTML as near-invisible text "HW1<i>.<n>.<len>:<data>".
     Rotating / moving a page turns that text sideways (or drops it when the page is rasterised),
     and the Edit page can no longer read it. So we read it from the ORIGINAL file and write it
     again as plain, upright, invisible text on every output page. */
  const HW_HEAD = /HW1(\d+)\.(\d+)\.(\d+):/g;
  const B64_ONLY = /^[A-Za-z0-9+/=]+$/;

  async function readHiddenSlices(doc) {
    const found = new Map();   // slice index -> { count, data }
    for (let p = 1; p <= doc.numPages; p++) {
      let text = '';
      try {
        const tc = await (await doc.getPage(p)).getTextContent();
        text = tc.items.map((it) => it.str).join('').replace(/\s+/g, '');
      } catch (_) { continue; }
      HW_HEAD.lastIndex = 0;
      let m;
      while ((m = HW_HEAD.exec(text))) {
        const start = HW_HEAD.lastIndex, len = +m[3], data = text.substr(start, len);
        const ok = data.length === len && B64_ONLY.test(data);
        if (ok && !found.has(+m[1])) found.set(+m[1], { count: +m[2], data });
        HW_HEAD.lastIndex = ok ? start + len : start;   // damaged copy: keep scanning right after its header
      }
    }
    return found;
  }

  function drawHiddenSlice(page, font, index, slice) {
    const full = `HW1${index}.${slice.count}.${slice.data.length}:${slice.data}`;
    for (let k = 0; k < full.length; k += 4000) {      // several short strings, read back in order
      page.drawText(full.slice(k, k + 4000), {
        x: 2, y: 2, size: 2, font, color: PDFLib.rgb(0, 0, 0), opacity: 0.01,
      });
    }
  }

  /* ---------- export ---------- */
  async function rasterPage(i, scaleCap, covers) {
    const page = await state.doc.getPage(i + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, scaleCap / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    for (const l of covers || []) {   // erase the original text pixels
      const b = boxOf(l);
      ctx.fillStyle = l.bg;
      ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
    }
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    c.width = c.height = 0;   // free the page bitmap right away
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function exportPdf() {
    const { PDFDocument, degrees } = PDFLib;
    const src = await PDFDocument.load(state.bytes, { ignoreEncryption: true });
    const srcPages = src.getPages();
    const out = await PDFDocument.create();
    const fonts = new Map();
    let hidden = new Map();
    try { hidden = await readHiddenSlices(state.doc); } catch (err) { console.error(err); }
    const hiddenFont = hidden.size ? await out.embedFont(PDFLib.StandardFonts.Courier) : null;

    for (let i = 0; i < state.pages.length; i++) {
      const t = T(i), th = t.a;
      const { W, H, cw, ch, f } = layout(i, th);
      const w = cw * f * t.z, h = ch * f * t.z;
      const cx = W / 2 + t.x * W, cy = H / 2 - t.y * H;   // UI y points down, PDF y points up
      const phi = (-th * Math.PI) / 180;                 // PDF angles are counter-clockwise
      const x = cx - (w / 2) * Math.cos(phi) + (h / 2) * Math.sin(phi);
      const y = cy - (w / 2) * Math.sin(phi) - (h / 2) * Math.cos(phi);
      const rotate = degrees((phi * 180) / Math.PI);
      const page = out.addPage([W, H]);

      const dirty = (state.txt[i] || []).filter((l) => l.dirty);
      const flat = dirty.length > 0 && el.flatChk.checked;
      if (state.pages[i].rot === 0 && !flat) {
        const emb = await out.embedPage(srcPages[i]);    // vector – text stays selectable
        page.drawPage(emb, { x, y, width: w, height: h, rotate });
      } else {
        const jpg = await out.embedJpg(await rasterPage(i, 3000, flat ? dirty : null));
        page.drawImage(jpg, { x, y, width: w, height: h, rotate });
      }
      if (dirty.length) await drawEdits(out, page, i, dirty, x, y, w / state.pages[i].w, phi, fonts);
      if (hidden.has(i)) drawHiddenSlice(page, hiddenFont, i, hidden.get(i));   // keeps the page editable on the Edit page
    }
    return out.save();
  }

  el.goBtn.addEventListener('click', async () => {
    if (!state.bytes) return;
    showMsg('');
    const label = el.goBtn.textContent;
    el.goBtn.disabled = true;
    el.goBtn.textContent = 'Processing…';
    const hideLoading = window.pdfCreateDownload.showDelayedLoading('Preparing PDF…', 5000);
    try {
      const data = await exportPdf();
      const blob = new Blob([data], { type: 'application/pdf' });
      $('saveModalText').textContent =
        `${state.pages.length} page${state.pages.length === 1 ? '' : 's'} ready. Download PDF opens the print dialog (5s); Download PDF compatible downloads a file (12s).`;
      $('saveModal').hidden = false;
      // Normal: 5s wait, then the browser's print dialog.
      $('saveModalDownload').onclick = (event) => {
        window.pdfCreateDownload.downloadNormal(event.currentTarget, blob);
      };
      // Compatible: 12s wait, then the PDF file downloads directly.
      $('saveModalCompat').onclick = (event) => {
        const filename = state.name.replace(/\.pdf$/i, '') + '_edited.pdf';
        window.pdfCreateDownload.downloadCompatible(event.currentTarget, async () => () => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        });
      };
    } catch (err) {
      console.error(err);
      showMsg('Something went wrong while creating the PDF. Try again, or try a different file.');
    } finally {
      hideLoading();
      el.goBtn.textContent = label;
      el.goBtn.disabled = false;
    }
  });

  $('saveModalClose').addEventListener('click', () => {
    $('saveModal').hidden = true;
    $('saveModalDownload').onclick = null;
    $('saveModalCompat').onclick = null;
  });
})();
