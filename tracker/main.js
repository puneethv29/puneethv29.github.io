// ─── Stock actions ────────────────────────────────────────────────────────────
async function addTickers() {
  const inp  = document.getElementById('ticker-input');
  const syms = inp.value.trim().toUpperCase().split(/[\s,;]+/).filter(s => /^[A-Z.\-]{1,12}$/.test(s));
  if (!syms.length) return;
  inp.value = '';
  const sess    = active();
  const toFetch = [];
  for (const sym of syms) {
    if (!sess.stocks[sym]) { sess.stocks[sym] = blankStock(sym); toFetch.push(sym); }
  }
  persist(); renderTable();
  enqueue(toFetch, state.activeId);
}

function refreshAll() {
  const sessId = state.activeId;
  const syms   = Object.keys(state.sessions[sessId]?.stocks || {});
  if (!syms.length) return;
  syms.forEach(sym => { state.sessions[sessId].stocks[sym].fetchStatus = 'pending'; });
  persist(); renderTable();
  qTotal = 0; queue = [];
  enqueue(syms, sessId);
}

function removeStock(sym) { delete active().stocks[sym]; persist(); renderTable(); }

function setRank(sym, val) {
  const s = active().stocks[sym]; if (!s) return;
  const n = parseInt(val);
  s.buyRank = (val === '' || isNaN(n) || n < 1 || n > 20) ? null : n;
  persist(); renderTable();
}

function switchSession(id) { state.activeId = id; persist(); renderAll(); }
function deleteSession(id) {
  if (Object.keys(state.sessions).length <= 1) return;
  delete state.sessions[id];
  if (state.activeId === id) state.activeId = Object.keys(state.sessions)[0];
  persist(); renderAll();
}

// ─── CSV import ───────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseNum(s) { return parseFloat(String(s ?? '').replace(/[$,%,\s]/g, '')) || null; }

function importCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { added: 0, skipped: 0, error: 'File appears empty or invalid.' };

  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col    = k => header.indexOf(k);
  const symIdx = col('symbol');
  if (symIdx < 0) return { added: 0, skipped: 0, error: 'Could not find a "Symbol" column.' };

  const priceIdx = ['lastsale', 'lastprice', 'price'].map(k => col(k)).find(i => i >= 0) ?? -1;
  const mcapIdx  = col('marketcap');
  const volIdx   = col('volume');
  const secIdx   = col('sector');
  const indIdx   = col('industry');
  const nameIdx  = col('name');

  const sess    = active();
  let added = 0, skipped = 0;
  const toFetch = [];

  for (let i = 1; i < lines.length; i++) {
    const row  = parseCSVLine(lines[i]);
    const sym  = row[symIdx]?.toUpperCase().trim();
    if (!sym || sym === 'SYMBOL' || !/^[A-Z.\-]{1,12}$/.test(sym)) { skipped++; continue; }

    const price  = priceIdx >= 0 ? parseNum(row[priceIdx]) : null;
    const mcap   = mcapIdx  >= 0 ? parseNum(row[mcapIdx])  : null;
    const vol    = volIdx   >= 0 ? parseNum(row[volIdx])   : null;
    const sector = secIdx   >= 0 ? (row[secIdx]  || '')    : '';
    const ind    = indIdx   >= 0 ? (row[indIdx]  || '')    : '';
    const name   = nameIdx  >= 0 ? (row[nameIdx] || sym)   : sym;

    if (sess.stocks[sym]) {
      if (sector) sess.stocks[sym].sector   = sector;
      if (ind)    sess.stocks[sym].industry = ind;
      if (name && name !== sym) sess.stocks[sym].name = name;
      if (!sess.stocks[sym].lastFetched) {
        if (price) sess.stocks[sym].currentPrice = price;
        if (mcap)  sess.stocks[sym].marketCap    = mcap;
        if (vol)   sess.stocks[sym].avgVolume     = vol;
      }
      skipped++;
    } else {
      sess.stocks[sym] = {
        symbol: sym, name, sector, industry: ind,
        currentPrice: price, price6m: null, gain: null,
        gain12m: null, gain3m: null, gain1m: null,
        marketCap: mcap, avgVolume: vol, adr: null,
        buyRank: null, fetchStatus: 'pending', fetchError: null, lastFetched: null,
      };
      toFetch.push(sym);
      added++;
    }
  }
  persist(); renderAll();
  if (toFetch.length) enqueue(toFetch, state.activeId);
  return { added, skipped, error: null };
}

// ─── CSV Modal ────────────────────────────────────────────────────────────────
function openModal()  { document.getElementById('modal-bg').classList.add('open'); }
function closeModal() {
  document.getElementById('modal-bg').classList.remove('open');
  document.getElementById('import-result').style.display = 'none';
  document.getElementById('file-input').value = '';
}
function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const result = importCSV(e.target.result);
    const el     = document.getElementById('import-result');
    if (result.error) {
      el.className = 'import-result warn'; el.textContent = result.error;
    } else {
      el.className  = 'import-result ok';
      el.textContent = `✓ ${result.added} stocks imported. ${result.skipped} already existed. Fetching trend data in background…`;
    }
    el.style.display = 'block';
    setTimeout(closeModal, 3000);
  };
  reader.readAsText(file);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const tab = e.target.closest('.session-tab');
  if (tab && !e.target.closest('.session-del')) { switchSession(tab.dataset.id); return; }
  const del = e.target.closest('.session-del');
  if (del) { deleteSession(del.dataset.del); return; }
  if (e.target.id === 'btn-add-sess2' || e.target.id === 'btn-new-session') {
    document.getElementById('new-session-form').style.display = 'flex';
    document.getElementById('ns-name').focus(); return;
  }
  const rb = e.target.closest('[data-rank-sym]');
  if (rb)  { startRankEdit(rb.dataset.rankSym); return; }
  const rr = e.target.closest('[data-refresh]');
  if (rr)  { enqueue([rr.dataset.refresh], state.activeId); return; }
  const rem = e.target.closest('[data-remove]');
  if (rem) { removeStock(rem.dataset.remove); return; }
  if (e.target.id === 'modal-bg') closeModal();
});

document.querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (state.sortCol === col) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
    else { state.sortCol = col; state.sortDir = col === 'symbol' ? 'asc' : 'desc'; }
    renderTable();
  });
});

document.getElementById('btn-add').addEventListener('click', addTickers);
document.getElementById('ticker-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTickers(); });
document.getElementById('btn-refresh-all').addEventListener('click', refreshAll);
document.getElementById('btn-import').addEventListener('click', openModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('progress-cancel').addEventListener('click', cancelQueue);
document.getElementById('file-input').addEventListener('change', e => handleFile(e.target.files[0]));
document.getElementById('btn-fmp').addEventListener('click', openUnivModal);
document.getElementById('univ-modal-close').addEventListener('click', closeUnivModal);
document.getElementById('univ-build-btn').addEventListener('click', buildUniverse);
document.getElementById('univ-cancel-btn').addEventListener('click', () => { univCancel = true; });
document.getElementById('univ-modal-bg').addEventListener('click', e => { if (e.target.id === 'univ-modal-bg') closeUnivModal(); });

const dz = document.getElementById('drop-zone');
dz.addEventListener('click',    () => document.getElementById('file-input').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave',    () => dz.classList.remove('drag-over'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });

document.getElementById('ns-create').addEventListener('click', () => {
  const name = document.getElementById('ns-name').value.trim(); if (!name) return;
  const id   = newSession(name); state.activeId = id; persist();
  document.getElementById('new-session-form').style.display = 'none';
  document.getElementById('ns-name').value = '';
  renderAll();
});
document.getElementById('ns-cancel').addEventListener('click', () => {
  document.getElementById('new-session-form').style.display = 'none';
  document.getElementById('ns-name').value = '';
});
document.getElementById('ns-name').addEventListener('keydown', e => {
  if (e.key === 'Enter')  document.getElementById('ns-create').click();
  if (e.key === 'Escape') document.getElementById('ns-cancel').click();
});

['f-adr', 'f-mcap', 'f-gain', 'f-sector', 'f-tt'].forEach(id =>
  document.getElementById(id).addEventListener('input', renderTable)
);

// ─── Custom tooltip (hover on desktop, tap on mobile) ─────────────────────────
(function () {
  const tip = document.getElementById('tip');
  let showTimer = null, hideTimer = null, touchMode = false;

  function setText(text) { tip.textContent = text; tip.style.display = 'block'; }
  function hide() {
    tip.style.display = 'none';
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  }
  function moveCursor(x, y) {
    const pad = 14, W = window.innerWidth, H = window.innerHeight;
    let left = x + pad, top = y + pad;
    if (left + tip.offsetWidth  > W - pad) left = x - tip.offsetWidth  - pad;
    if (top  + tip.offsetHeight > H - pad) top  = y - tip.offsetHeight - pad;
    if (top < 8) top = 8;
    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
  }
  function posElement(el) {
    const rect = el.getBoundingClientRect();
    const pad  = 8, W = window.innerWidth;
    const tipW = tip.offsetWidth;
    let left = Math.max(pad, Math.min(rect.left + rect.width / 2 - tipW / 2, W - tipW - pad));
    let top  = rect.top - tip.offsetHeight - pad;
    if (top < 8) top = rect.bottom + pad;
    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
  }

  document.addEventListener('mouseover', e => {
    if (touchMode) return;
    const el = e.target.closest('[data-tip]');
    clearTimeout(showTimer);
    if (!el || !el.dataset.tip) { hide(); return; }
    showTimer = setTimeout(() => { setText(el.dataset.tip); moveCursor(e.clientX, e.clientY); }, 180);
  });
  document.addEventListener('mousemove', e => {
    if (touchMode || tip.style.display === 'none') return;
    moveCursor(e.clientX, e.clientY);
  });
  document.addEventListener('mouseout', e => {
    if (touchMode || !e.target.closest('[data-tip]')) return;
    clearTimeout(showTimer); hide();
  });
  document.addEventListener('touchstart', e => {
    touchMode = true;
    clearTimeout(showTimer); clearTimeout(hideTimer);
    const el = e.target.closest('[data-tip]');
    if (!el || !el.dataset.tip) { hide(); return; }
    if (tip.style.display !== 'none') { hide(); return; }
    setText(el.dataset.tip);
    posElement(el);
    hideTimer = setTimeout(hide, 5000);
  }, { passive: true });
})();

// ─── Init ─────────────────────────────────────────────────────────────────────
load();
renderAll();
