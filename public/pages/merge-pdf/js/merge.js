(function () {
  const { PDFDocument } = PDFLib;
  const $ = (id) => document.getElementById(id);
  const items = []; // {id, name, size, bytes, pages, thumb}
  let uid = 0;
  const list = $('fileList'), msg = $('msg');

  function show(text, ok) { msg.textContent = text; msg.className = 'msg' + (ok ? ' ok' : ''); msg.hidden = !text; }

  async function addFiles(files) {
    show('');
    const bad = [];
    for (const f of files) {
      if (!PDFTools.isPdf(f)) { bad.push(f.name + ' (not a PDF)'); continue; }
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        let thumb = null;
        try {
          const pj = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
          thumb = await PDFTools.renderThumb(pj, 1, 60);
          pj.destroy();
        } catch (e) { /* thumbnail is optional */ }
        items.push({ id: ++uid, name: f.name, size: f.size, bytes, pages: doc.getPageCount(), thumb });
      } catch (e) { bad.push(f.name + ' (could not be read or is password-protected)'); }
    }
    if (bad.length) show('Skipped: ' + bad.join(', '));
    render();
  }

  function move(i, d, keepFocusOn) {
    const j = i + d; if (j < 0 || j >= items.length) return;
    items.splice(j, 0, items.splice(i, 1)[0]); render();
    if (keepFocusOn) { const h = list.querySelector('[data-id="' + keepFocusOn + '"] .fl-handle'); if (h) h.focus(); }
  }

  function render() {
    list.innerHTML = '';
    items.forEach((it, i) => {
      list.appendChild(PDFFileList.item({
        id: it.id, name: it.name, index: i, count: items.length, fallback: 'PDF',
        info: it.pages + (it.pages === 1 ? ' page' : ' pages') + ' · ' + PDFFileList.fmtSize(it.size),
        thumb: it.thumb,
        onUp: (kb) => move(i, -1, kb && it.id), onDown: (kb) => move(i, 1, kb && it.id),
        onRemove: () => { items.splice(i, 1); render(); }
      }));
    });
    const has = items.length > 0;
    $('listPanel').hidden = !has; $('actionBar').hidden = !has; $('emptyMsg').hidden = has;
    const total = items.reduce((s, x) => s + x.pages, 0);
    $('summary').textContent = items.length + (items.length === 1 ? ' file' : ' files') + ' · ' + total + ' pages total' + (items.length < 2 ? ' — add at least 2 files' : '');
    $('mergeBtn').disabled = items.length < 2;
  }

  async function merge() {
    const btn = $('mergeBtn'); const old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Merging…'; show('');
    try {
      const out = await PDFDocument.create();
      for (const it of items) {
        const src = await PDFDocument.load(it.bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      PDFTools.download(new Blob([bytes], { type: 'application/pdf' }), 'merged.pdf');
      show('Done! Your merged PDF (' + out.getPageCount() + ' pages) has been downloaded.', true);
    } catch (e) {
      console.error(e); show('Could not merge these files. One of them may be damaged or protected.');
    } finally { btn.innerHTML = old; btn.disabled = items.length < 2; }
  }

  PDFFileList.bindDrop($('dropzone'), $('fileInput'), addFiles);
  PDFFileList.enableSort(list, (ids) => {
    const byId = new Map(items.map((x) => [String(x.id), x]));
    const next = ids.map((id) => byId.get(id)).filter(Boolean);
    items.length = 0; items.push(...next); render();
  });
  $('clearBtn').addEventListener('click', () => { items.length = 0; show(''); render(); });
  $('mergeBtn').addEventListener('click', merge);
  render();
})();
