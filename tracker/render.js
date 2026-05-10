// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtPx   = v => v == null ? '—' : '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtGain = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
const fmtMcap = v => { if (!v) return '—'; if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'; if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'; return '$' + (v / 1e6).toFixed(0) + 'M'; };
const fmtVol  = v => { if (!v) return '—'; if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B'; if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'; return (v / 1e3).toFixed(0) + 'K'; };
const fmtAdr  = v => v == null ? '—' : v.toFixed(1) + '%';
const fmtAge  = ts => { if (!ts) return ''; const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; return Math.round(m / 60) + 'h ago'; };
const esc     = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rankCls = r => !r ? '' : r <= 5 ? 'gold' : r <= 10 ? 'silver' : 'bronze';

function gainBar(gain, maxGain) {
  if (gain == null) return '';
  const pct = Math.min(Math.abs(gain) / Math.max(maxGain, 1) * 100, 100).toFixed(1);
  const col = gain >= 0 ? 'var(--green)' : 'var(--red)';
  return `<div class="gain-bar-track"><div class="gain-bar-fill" style="width:${pct}%;background:${col}"></div></div>`;
}

function ttBadge(s) {
  const { checks, score } = evalTT(s);
  const cls = score === 8 ? 'tt-full' : score >= 7 ? 'tt-high' : score >= 5 ? 'tt-mid' : 'tt-low';
  const tooltip = TT_LABELS.map((lbl, i) => {
    let line = (checks[i] ? '✓' : '✗') + ' ' + lbl;
    if (i === 7) line += s.rsRank != null ? ` (rank: ${s.rsRank})` : ' (rank: N/A)';
    return line;
  }).join('\n');
  return `<span class="tt-badge ${cls}" data-tip="${esc(tooltip)}">${score}/8</span>`;
}

// ─── Filter / sort ────────────────────────────────────────────────────────────
function filteredSorted() {
  const minAdr    = parseFloat(document.getElementById('f-adr').value)  || 0;
  const minMcap   = parseFloat(document.getElementById('f-mcap').value) || 0;
  const gainStr   = document.getElementById('f-gain').value.trim();
  const minGain   = gainStr !== '' ? parseFloat(gainStr) : null;
  const secFilter = document.getElementById('f-sector').value;
  const minTT     = parseInt(document.getElementById('f-tt').value) || 0;

  let rows = Object.values(active().stocks).filter(s => {
    if (s.univStub) return true;
    if (minAdr  > 0  && (s.adr == null || s.adr < minAdr)) return false;
    if (minMcap > 0  && (s.marketCap == null || s.marketCap / 1e9 < minMcap)) return false;
    if (minGain != null && (s.gain == null || s.gain < minGain)) return false;
    if (secFilter && s.sector !== secFilter) return false;
    if (minTT > 0 && (!s.lastFetched || evalTT(s).score < minTT)) return false;
    return true;
  });

  const col = state.sortCol, dir = state.sortDir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    if (a.univStub && !b.univStub) return 1;
    if (!a.univStub && b.univStub) return -1;
    let av = col === 'rank' ? (a.buyRank ?? 9999) : col === 'tt' ? (a.lastFetched ? evalTT(a).score : -1) : a[col];
    let bv = col === 'rank' ? (b.buyRank ?? 9999) : col === 'tt' ? (b.lastFetched ? evalTT(b).score : -1) : b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });
  if (rows.length > 500) rows.length = 500;
  return rows;
}

function populateSectorFilter() {
  const sel  = document.getElementById('f-sector');
  const cur  = sel.value;
  const secs = [...new Set(Object.values(active().stocks).map(s => s.sector).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All sectors</option>' + secs.map(s => `<option value="${esc(s)}" ${s === cur ? 'selected' : ''}>${esc(s)}</option>`).join('');
}

function startRankEdit(sym) {
  const row = document.querySelector(`tr[data-sym="${esc(sym)}"]`);
  if (!row) return;
  const badge = row.querySelector('.rank-badge');
  if (!badge) return;
  const s   = active().stocks[sym];
  const inp = document.createElement('input');
  inp.type = 'number'; inp.className = 'rank-input';
  inp.min = 1; inp.max = 20;
  inp.value = s?.buyRank ?? '';
  inp.placeholder = '1–20';
  badge.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = () => setRank(sym, inp.value.trim());
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') renderTable();
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderAll() { renderSessions(); renderTable(); }

function renderSessions() {
  const bar  = document.getElementById('sessions-bar');
  const sess = Object.values(state.sessions).sort((a, b) => b.createdAt - a.createdAt);
  bar.innerHTML = sess.map(s => {
    const n   = Object.keys(s.stocks).length;
    const cnt = n ? ` <span style="opacity:.5;font-weight:400">(${n})</span>` : '';
    return `<button class="session-tab ${s.id === state.activeId ? 'active' : ''}" data-id="${s.id}">
      ${esc(s.name)}${cnt}
      <span class="session-del" data-del="${s.id}" title="Delete">×</span>
    </button>`;
  }).join('') + `<button class="btn-add-session" id="btn-add-sess2">+ New Session</button>`;
}

function renderTable() {
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty-state');
  const rows  = filteredSorted();

  document.querySelectorAll('th[data-col]').forEach(th => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.col === state.sortCol) th.classList.add(state.sortDir);
  });

  populateSectorFilter();

  const noStocks = !Object.keys(active().stocks).length;
  empty.style.display = (noStocks || !rows.length) ? 'block' : 'none';
  if (!rows.length) { tbody.innerHTML = ''; updateFooter(); return; }

  const maxGain = Math.max(...rows.map(s => s.gain != null ? Math.abs(s.gain) : 0), 1);

  tbody.innerHTML = rows.map(s => {
    const gainCls = s.gain == null ? '' : s.gain >= 0 ? 'pos' : 'neg';
    const rk      = s.buyRank;

    let statusHTML = '';
    if      (s.fetchStatus === 'loading') statusHTML = '<span class="spinner"></span>';
    else if (s.fetchStatus === 'error')   statusHTML = `<span class="err-txt" title="${esc(s.fetchError)}">✗ ${esc(s.fetchError)}</span>`;
    else if (s.fetchStatus === 'pending') statusHTML = '<span class="pending-txt">queued</span>';
    else if (s.lastFetched)               statusHTML = `<span class="ok-txt">${fmtAge(s.lastFetched)}</span>`;

    const sectorLine = [s.sector, s.industry].filter(Boolean).join(' · ');

    return `<tr data-sym="${esc(s.symbol)}">
      <td><span class="rank-badge ${rankCls(rk)}" data-rank-sym="${esc(s.symbol)}">${rk ?? '—'}</span></td>
      <td><div class="sym">${esc(s.symbol)}</div></td>
      <td>
        <div class="co-name" title="${esc(s.name)}">${esc(s.name)}</div>
        ${sectorLine ? `<div class="sector-tag">${esc(sectorLine)}</div>` : ''}
      </td>
      <td>${fmtPx(s.currentPrice)}</td>
      <td style="color:var(--text2)">${fmtPx(s.price6m)}</td>
      <td><div class="gain-wrap"><span class="${gainCls}">${fmtGain(s.gain)}</span>${gainBar(s.gain, maxGain)}</div></td>
      <td>${fmtMcap(s.marketCap)}</td>
      <td>${fmtVol(s.avgVolume)}</td>
      <td>${fmtAdr(s.adr)}</td>
      <td>${s.lastFetched ? ttBadge(s) : ''}</td>
      <td style="white-space:nowrap">${statusHTML} <button class="row-refresh" data-refresh="${esc(s.symbol)}">↻</button></td>
      <td><button class="remove-btn" data-remove="${esc(s.symbol)}">×</button></td>
    </tr>`;
  }).join('');

  updateFooter();
}

function updateFooter() {
  const stocks  = Object.values(active().stocks);
  const visible = stocks.filter(s => !s.univStub);
  const stubs   = stocks.filter(s => s.univStub).length;
  const fetched = visible.filter(s => s.lastFetched).length;
  const errs    = visible.filter(s => s.fetchStatus === 'error').length;
  const footer  = document.getElementById('footer');
  if (!stocks.length) { footer.textContent = ''; return; }
  const parts = [];
  if (stubs) parts.push(`${stubs.toLocaleString()} pending market cap check`);
  parts.push(`${fetched}/${visible.length} fetched`);
  if (errs) parts.push(`${errs} error${errs > 1 ? 's' : ''}`);
  const ts = visible.map(s => s.lastFetched).filter(Boolean);
  if (ts.length) parts.push(`updated ${fmtAge(Math.max(...ts))}`);
  parts.push('Yahoo Finance · ~15 min delay during market hours');
  footer.textContent = parts.join(' · ');
}
