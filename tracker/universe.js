let univCancel  = false;
let univMinMcap = 0;

function openUnivModal() {
  document.getElementById('univ-modal-bg').classList.add('open');
  document.getElementById('univ-result').style.display    = 'none';
  document.getElementById('univ-progress').style.display  = 'none';
  document.getElementById('univ-cancel-btn').style.display = 'none';
  document.getElementById('univ-build-btn').disabled      = false;
  document.getElementById('univ-build-btn').textContent   = 'Build Universe';
}
function closeUnivModal() { document.getElementById('univ-modal-bg').classList.remove('open'); }

function univStatus(msg, pct) {
  document.getElementById('univ-progress').style.display  = 'block';
  document.getElementById('univ-progress-text').textContent = msg;
  document.getElementById('univ-progress-fill').style.width = pct + '%';
}
function univResult(cls, msg) {
  const el = document.getElementById('univ-result');
  el.className    = 'import-result ' + cls;
  el.textContent  = msg;
  el.style.display = 'block';
}

async function buildUniverse() {
  const minMcap   = parseInt(document.getElementById('univ-mcap').value);
  const exchVal   = document.getElementById('univ-exchange').value;
  const mcapLabel = minMcap >= 1e9 ? `$${(minMcap / 1e9).toFixed(0)}B` : `$${(minMcap / 1e6).toFixed(0)}M`;

  const buildBtn  = document.getElementById('univ-build-btn');
  const cancelBtn = document.getElementById('univ-cancel-btn');
  buildBtn.disabled = true; buildBtn.textContent = 'Loading…';
  cancelBtn.style.display = 'none';

  try {
    // Primary: our own /api/universe serverless function (no CORS, no proxy needed)
    univStatus('Fetching universe…', 20);
    let rows = null;
    try {
      const r    = await fetch(`/api/universe?exchange=${encodeURIComponent(exchVal)}&minMcap=${minMcap}`, { cache: 'no-store' });
      const data = await r.json();
      rows = data?.rows;
    } catch {}

    if (rows?.length) {
      // /api/universe already filtered by market cap — rows are ready to import
      univStatus(`Got ${rows.length} stocks. Importing…`, 70);
      const sess = active();
      const toFetch = [];
      let added = 0, skipped = 0;

      for (const row of rows) {
        const sym = (row.symbol || '').toUpperCase().trim();
        if (!sym) { skipped++; continue; }
        if (sess.stocks[sym]) { skipped++; continue; }
        sess.stocks[sym] = {
          ...blankStock(sym),
          name: row.name || sym, sector: row.sector || '', industry: row.industry || '',
          currentPrice: row.currentPrice ?? null,
          marketCap:    row.marketCap    ?? null,
          avgVolume:    row.avgVolume    ?? null,
        };
        toFetch.push(sym);
        added++;
      }

      persist(); renderAll();
      if (toFetch.length) enqueue(toFetch, state.activeId);
      univStatus('Done — stocks visible in table now.', 100);
      univResult('ok', `✓ ${added} stocks loaded. Trend data fetching in background…`);
      setTimeout(closeUnivModal, 4000);
      return;
    }

    // Fallback: EDGAR ticker list → stubs → prune during fetch
    univStatus('/api/universe unavailable. Falling back to EDGAR ticker list…', 30);
    let edgarData, hasExchange = true;
    try { edgarData = await fetchJSONSafe(EDGAR_EXCH_URL); }
    catch {
      try { edgarData = await fetchJSONSafe(EDGAR_BASE_URL); hasExchange = false; }
      catch (e2) { throw new Error('Could not load ticker list from EDGAR. (' + e2.message + ')'); }
    }

    const EXCH_MAP   = { nasdaq: ['nasdaq'], nyse: ['nyse', 'nyse arca', 'nyse mkt', 'nyse american'] };
    const exchFilter = new Set(exchVal.split(','));
    const allowed    = new Set([...exchFilter].flatMap(k => EXCH_MAP[k] || [k]));
    let allTickers;
    if (Array.isArray(edgarData.data) && Array.isArray(edgarData.fields)) {
      const fi = {
        ticker:   edgarData.fields.indexOf('ticker'),
        name:     edgarData.fields.indexOf('name'),
        exchange: edgarData.fields.indexOf('exchange'),
      };
      allTickers = edgarData.data
        .filter(row => {
          const s = row[fi.ticker];
          if (!s) return false;
          if (hasExchange && fi.exchange >= 0 && row[fi.exchange]) return allowed.has(row[fi.exchange].toLowerCase());
          return true;
        })
        .map(row => ({ symbol: String(row[fi.ticker]).toUpperCase().trim(), name: String(row[fi.name] || '') }));
    } else {
      allTickers = Object.values(edgarData)
        .filter(t => {
          if (!t.ticker) return false;
          if (hasExchange && t.exchange) return allowed.has(t.exchange.toLowerCase());
          return true;
        })
        .map(t => ({ symbol: t.ticker.toUpperCase().trim(), name: t.name || '' }));
    }
    allTickers = allTickers.filter(t => /^[A-Z.\-]{1,12}$/.test(t.symbol));
    if (!allTickers.length) throw new Error('No tickers found from EDGAR. Try "NYSE + NASDAQ".');

    univStatus(`Got ${allTickers.length} tickers. Importing as stubs — stocks appear as data arrives…`, 70);
    univMinMcap = minMcap;
    const result = importUniverse(allTickers);
    univResult('ok', `✓ ${result.added} tickers queued. Stocks below ${mcapLabel} market cap will be pruned as data arrives.`);
    setTimeout(closeUnivModal, 4000);

  } catch (e) {
    univResult('warn', '✗ ' + e.message);
  } finally {
    buildBtn.disabled = false; buildBtn.textContent = 'Build Universe';
    cancelBtn.style.display = 'none';
  }
}

function importUniverse(tickers) {
  const sess = active();
  let added = 0, skipped = 0;
  const toFetch = [];
  for (const item of tickers) {
    const sym = (item.symbol || '').toUpperCase().trim();
    if (!sym || !/^[A-Z.\-]{1,12}$/.test(sym)) { skipped++; continue; }
    if (sess.stocks[sym]) {
      skipped++;
    } else {
      sess.stocks[sym] = { ...blankStock(sym), name: item.name || sym, univStub: true };
      toFetch.push(sym);
      added++;
    }
  }
  persist(); renderAll();
  if (toFetch.length) enqueue(toFetch, state.activeId);
  return { added, skipped };
}
