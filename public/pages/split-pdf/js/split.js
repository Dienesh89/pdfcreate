(function () {
  const { PDFDocument } = PDFLib;
  const $ = (id) => document.getElementById(id);
  const msg = $('msg'), dz = $('dropzone'), input = $('fileInput');
  let file = null, bytes = null, total = 0, pjDoc = null, mode = 'ranges';
  const selected = new Set(); // 0-based page indices

  function show(text, ok) { msg.textContent = text; msg.className = 'msg' + (ok ? ' ok' : ''); msg.hidden = !text; }

  async function load(f) {
    show('');
    if (!PDFTools.isPdf(f)) return show('Please choose a PDF file.');
    try {
      bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      total = doc.getPageCount();
    } catch (e) { return show('This PDF could not be read. It may be damaged or password-protected.'); }
    file = f; selected.clear();
    if (pjDoc) { pjDoc.destroy(); pjDoc = null; }
    try { pjDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; } catch (e) { pjDoc = null; }
    $('fileName').textContent = f.name;
    $('fileInfo').textContent = total + (total === 1 ? ' page' : ' pages') + ' · ' + PDFTools.fmtSize(f.size);
    const th = $('fileThumb'); th.textContent = 'PDF';
    if (pjDoc) PDFTools.renderThumb(pjDoc, 1, 60).then((c) => { th.textContent = ''; th.appendChild(c); }).catch(() => {});
    $('uploadPanel').hidden = true; $('splitUi').hidden = false;
    $('everyInput').max = total; $('rangeInput').value = '';
    buildGrid(); setMode('ranges'); update();
  }

  function reset() {
    file = bytes = null; total = 0; selected.clear();
    if (pjDoc) { pjDoc.destroy(); pjDoc = null; }
    $('splitUi').hidden = true; $('uploadPanel').hidden = false; $('pageGrid').innerHTML = ''; show('');
  }

  /* "1-3, 5, 7-9" -> [[0,1,2],[4],[6,7,8]] or null with error text */
  function parseRanges(text) {
    const out = [];
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return { error: '' };
    for (const p of parts) {
      const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p);
      if (!m) return { error: 'Invalid range "' + p + '". Use numbers like 1-3, 5.' };
      let a = +m[1], b = m[2] ? +m[2] : a;
      if (a > b) [a, b] = [b, a];
      if (a < 1 || b > total) return { error: 'Range "' + p + '" is outside the document (1–' + total + ').' };
      const r = []; for (let i = a; i <= b; i++) r.push(i - 1); out.push(r);
    }
    return { groups: out };
  }

  function plan() { // -> {groups:[[idx..]], error}
    if (mode === 'ranges') {
      const r = parseRanges($('rangeInput').value);
      if (r.error !== undefined) return { groups: [], error: r.error };
      return $('mergeRanges').checked ? { groups: [r.groups.flat()] } : r;
    }
    if (mode === 'every') {
      const n = Math.floor(+$('everyInput').value);
      if (!(n >= 1)) return { groups: [], error: 'Enter a number of 1 or more.' };
      const g = []; for (let i = 0; i < total; i += n) g.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
      return { groups: g };
    }
    const s = [...selected].sort((a, b) => a - b);
    return { groups: s.length ? [s] : [] };
  }

  function update() {
    const p = plan();
    const g = p.groups || [];
    const pages = g.reduce((s, x) => s + x.length, 0);
    $('summary').textContent = p.error ? p.error : (g.length ? g.length + (g.length === 1 ? ' file' : ' files') + ' · ' + pages + ' pages' : (mode === 'select' ? 'No pages selected' : ''));
    $('splitBtn').disabled = !g.length || !!p.error;
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#modes .mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $('paneRanges').hidden = m !== 'ranges'; $('paneEvery').hidden = m !== 'every'; $('paneSelect').hidden = m !== 'select';
    update();
  }

  function buildGrid() {
    const grid = $('pageGrid'); grid.innerHTML = '';
    // Thumbnails are drawn when a page scrolls near the view and freed again when it leaves (keeps RAM low on big PDFs)
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
      es.forEach((en) => {
        const d = en.target, i = +d.dataset.i;
        if (en.isIntersecting) {
          if (d._canvas || d._busy || !pjDoc) return;
          d._busy = true;
          const doc = pjDoc;
          PDFTools.renderThumb(doc, i + 1, 110).then((c) => {
            d._busy = false;
            if (doc !== pjDoc || !d.isConnected) { c.width = c.height = 0; return; }
            if (!d._visible) { c.width = c.height = 0; return; }
            d._canvas = c; d.insertBefore(c, d.firstChild);
          }).catch(() => { d._busy = false; });
        } else if (d._canvas) {
          d._canvas.remove(); d._canvas.width = d._canvas.height = 0; d._canvas = null;
        }
        d._visible = en.isIntersecting;
      });
    }, { root: grid, rootMargin: '300px' }) : null;
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div'); d.className = 'pg'; d.dataset.i = i; d.tabIndex = 0; d._visible = true;
      d.setAttribute('role', 'checkbox'); d.setAttribute('aria-checked', 'false'); d.setAttribute('aria-label', 'Page ' + (i + 1));
      const s = document.createElement('span'); s.textContent = i + 1; d.appendChild(s);
      const tog = () => { selected.has(i) ? selected.delete(i) : selected.add(i); sync(); };
      d.addEventListener('click', tog);
      d.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tog(); } });
      grid.appendChild(d); if (io) io.observe(d);
    }
  }
  function sync() {
    document.querySelectorAll('#pageGrid .pg').forEach((d) => { const on = selected.has(+d.dataset.i); d.classList.toggle('sel', on); d.setAttribute('aria-checked', on); });
    update();
  }
  const pick = (fn) => () => { selected.clear(); for (let i = 0; i < total; i++) if (fn(i)) selected.add(i); sync(); };

  function pad(n, w) { return String(n).padStart(w, '0'); }
  function label(g) { const a = g[0] + 1, b = g[g.length - 1] + 1; return g.length === 1 ? 'page-' + a : (g.every((v, i) => v === g[0] + i) ? 'pages-' + a + '-' + b : 'selected-pages'); }

  async function run() {
    const p = plan(); if (p.error || !p.groups.length) return;
    const btn = $('splitBtn'), old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Splitting…'; show('');
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const base = PDFTools.baseName(file.name), outs = [];
      const w = String(p.groups.length).length;
      for (let k = 0; k < p.groups.length; k++) {
        const doc = await PDFDocument.create();
        (await doc.copyPages(src, p.groups[k])).forEach((pg) => doc.addPage(pg));
        const name = base + '_' + (p.groups.length === 1 ? label(p.groups[0]) : pad(k + 1, w) + '_' + label(p.groups[k])) + '.pdf';
        outs.push({ name, data: await doc.save() });
      }
      if (outs.length === 1) PDFTools.download(new Blob([outs[0].data], { type: 'application/pdf' }), outs[0].name);
      else PDFTools.download(PDFTools.makeZip(outs), base + '_split.zip');
      show('Done! ' + (outs.length === 1 ? 'Your PDF has' : outs.length + ' PDFs have') + ' been downloaded' + (outs.length > 1 ? ' as a ZIP file.' : '.'), true);
    } catch (e) { console.error(e); show('Could not split this PDF. It may be damaged or protected.'); }
    finally { btn.innerHTML = old; update(); }
  }

  input.addEventListener('change', () => { if (input.files[0]) load(input.files[0]); input.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('drag')));
  dz.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
  $('removeBtn').addEventListener('click', reset);
  document.querySelectorAll('#modes .mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('rangeInput').addEventListener('input', update); $('mergeRanges').addEventListener('change', update); $('everyInput').addEventListener('input', update);
  $('selAll').addEventListener('click', pick(() => true)); $('selNone').addEventListener('click', pick(() => false));
  $('selOdd').addEventListener('click', pick((i) => i % 2 === 0)); $('selEven').addEventListener('click', pick((i) => i % 2 === 1));
  $('splitBtn').addEventListener('click', run);
})();
