/* Shared helpers for the "add files" list (Merge PDF + image pages).
   Pointer-based reordering so it works with a finger as well as a mouse. */
window.PDFFileList = (function () {
  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }

  function mk(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function iconBtn(icon, label, fn, disabled, cls) {
    const b = mk('button', 'fl-btn' + (cls ? ' ' + cls : '')); b.type = 'button';
    b.setAttribute('aria-label', label); b.title = label; b.disabled = !!disabled;
    b.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
    b.addEventListener('click', fn); return b;
  }

  /* o: {id, name, info, thumb (Node|null), fallback ('PDF'|'IMG'), index, count,
         onUp, onDown, onRemove, onThumb} */
  function item(o) {
    const li = mk('li', 'fl-item'); li.dataset.id = o.id;
    const multi = o.count > 1;
    if (multi) {
      const h = mk('button', 'fl-handle'); h.type = 'button';
      h.innerHTML = '<i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>';
      h.setAttribute('aria-label', 'Reorder ' + o.name + ' (drag, or use arrow up / down)');
      h.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault(); (e.key === 'ArrowUp' ? o.onUp : o.onDown)(true);
      });
      li.appendChild(h);
    }
    const th = mk(o.onThumb ? 'button' : 'div', 'fl-thumb' + (o.onThumb ? ' fl-thumb-btn' : ''));
    if (o.onThumb) { th.type = 'button'; th.setAttribute('aria-label', 'Preview ' + o.name); th.addEventListener('click', o.onThumb); }
    if (o.thumb) th.appendChild(o.thumb); else th.textContent = o.fallback || '';
    const meta = mk('div', 'fl-meta');
    meta.append(mk('div', 'fl-name', o.name), mk('div', 'fl-info', o.info || ''));
    const act = mk('div', 'fl-actions');
    if (multi) {
      act.append(iconBtn('fa-arrow-up', 'Move up', () => o.onUp(false), o.index === 0),
                 iconBtn('fa-arrow-down', 'Move down', () => o.onDown(false), o.index === o.count - 1));
    }
    act.append(iconBtn('fa-xmark', 'Remove ' + o.name, o.onRemove));
    li.append(th, meta, act);
    return li;
  }

  /* Drag the grip to reorder. onOrder(ids[]) is called once on release. */
  function enableSort(list, onOrder) {
    list.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.fl-handle');
      if (!handle || !list.contains(handle)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const item = handle.closest('.fl-item');
      const pid = e.pointerId;
      handle.setPointerCapture(pid);
      let startPageY = e.clientY + window.scrollY, lastY = e.clientY, raf = 0, scrollRaf = 0;
      item.classList.add('fl-dragging'); document.body.classList.add('fl-sorting');

      function place() {
        raf = 0;
        item.style.transform = 'translateY(' + (lastY + window.scrollY - startPageY) + 'px)';
        const r = item.getBoundingClientRect(), c = r.top + r.height / 2;
        const next = item.nextElementSibling, prev = item.previousElementSibling;
        let moved = false, before = item.offsetTop;
        if (next) { const nr = next.getBoundingClientRect(); if (c > nr.top + nr.height / 2) { list.insertBefore(next, item); moved = true; } }
        if (!moved && prev) { const pr = prev.getBoundingClientRect(); if (c < pr.top + pr.height / 2) { list.insertBefore(item, prev); moved = true; } }
        if (moved) { startPageY += item.offsetTop - before; item.style.transform = 'translateY(' + (lastY + window.scrollY - startPageY) + 'px)'; }
      }
      const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
      function autoScroll() { // only runs while the pointer is near a screen edge
        scrollRaf = 0;
        const edge = 70, step = 12;
        if (lastY < edge) window.scrollBy(0, -step); else if (lastY > window.innerHeight - edge) window.scrollBy(0, step); else return;
        place(); scrollRaf = requestAnimationFrame(autoScroll);
      }
      const onMove = (ev) => { lastY = ev.clientY; schedule(); if (!scrollRaf) scrollRaf = requestAnimationFrame(autoScroll); };
      function finish() {
        cancelAnimationFrame(raf); cancelAnimationFrame(scrollRaf);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', finish);
        handle.removeEventListener('pointercancel', finish);
        if (handle.hasPointerCapture(pid)) handle.releasePointerCapture(pid);
        item.classList.remove('fl-dragging'); item.style.transform = '';
        document.body.classList.remove('fl-sorting');
        onOrder([...list.children].map((li) => li.dataset.id));
      }
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });
  }

  /* Choose-files input + drag & drop onto the dropzone */
  function bindDrop(zone, input, onFiles) {
    input.addEventListener('change', () => { const f = [...input.files]; input.value = ''; if (f.length) onFiles(f); });
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('fl-drag'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('fl-drag')));
    zone.addEventListener('drop', (e) => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) onFiles(f); });
  }

  /* Small thumbnail without decoding the full photo into memory */
  async function imageThumb(file, width) {
    const w = Math.round(width * Math.min(window.devicePixelRatio || 1, 2));
    try {
      const bmp = await createImageBitmap(file, { resizeWidth: w, resizeQuality: 'medium' });
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close();
      return c;
    } catch (e) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
          const s = Math.min(1, w / img.width), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url); img.src = ''; resolve(c);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      });
    }
  }

  return { fmtSize, item, enableSort, bindDrop, imageThumb };
})();
