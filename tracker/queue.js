let queue = [], qTotal = 0, qRunning = false, qCancel = false;

function enqueue(symbols, sessionId) {
  const sess = state.sessions[sessionId];
  const sorted = [...symbols].sort((a, b) => {
    const ma = sess?.stocks[a]?.marketCap ?? 0;
    const mb = sess?.stocks[b]?.marketCap ?? 0;
    return mb - ma;
  });
  queue.push(...sorted.map(sym => ({ symbol: sym, sessionId })));
  qTotal = queue.length;
  if (!qRunning) runQueue();
  else updateProgress();
}

async function runQueue() {
  qRunning = true; qCancel = false;
  showProgress();
  while (queue.length && !qCancel) {
    const batch = queue.splice(0, QUEUE_CONCURRENCY);
    await Promise.all(batch.map(item => fetchOne(item.symbol, item.sessionId)));
    updateProgress();
    await delay(100);
  }
  qRunning   = false;
  qTotal     = 0;
  univMinMcap = 0;
  hideProgress();
  updateFooter();
}

function cancelQueue() { qCancel = true; queue = []; }

function showProgress() {
  document.getElementById('progress-wrap').style.display = 'flex';
  updateProgress();
}
function hideProgress() {
  document.getElementById('progress-wrap').style.display = 'none';
}
function updateProgress() {
  const done     = qTotal - queue.length;
  const pct      = qTotal ? Math.round(done / qTotal * 100) : 100;
  const secsLeft = Math.round(queue.length / QUEUE_CONCURRENCY * 1.6);
  const timeStr  = secsLeft >= 60 ? `~${Math.ceil(secsLeft / 60)}min` : `~${secsLeft}s`;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-text').textContent =
    `Fetching trend data: ${done} / ${qTotal}` +
    (queue.length ? ` · ${timeStr} remaining` : ' · done');
}

async function fetchOne(symbol, sessionId) {
  const sess = state.sessions[sessionId];
  if (!sess?.stocks[symbol]) return;
  sess.stocks[symbol].fetchStatus = 'loading';
  sess.stocks[symbol].fetchError  = null;
  if (sessionId === state.activeId) renderTable();
  try {
    const data = await fetchYF(symbol);
    const existing = sess.stocks[symbol];
    Object.assign(existing, data);
    if (univMinMcap > 0 && existing.univStub) {
      if (!data.marketCap || data.marketCap < univMinMcap) {
        delete sess.stocks[symbol];
        persist();
        if (sessionId === state.activeId) renderTable();
        return;
      }
    }
    delete existing.univStub;
    computeRSRanks(sessionId);
  } catch (e) {
    if (univMinMcap > 0 && sess.stocks[symbol]?.univStub) {
      delete sess.stocks[symbol];
      persist();
      return;
    }
    sess.stocks[symbol].fetchStatus = 'error';
    sess.stocks[symbol].fetchError  = e.message;
  }
  persist();
  if (sessionId === state.activeId) renderTable();
}
