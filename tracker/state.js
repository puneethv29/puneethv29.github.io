let state = { sessions: {}, activeId: null, sortCol: 'gain', sortDir: 'desc' };

function load() {
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (s) state = { ...state, ...JSON.parse(s) };
  } catch {}
  // migrate from old key
  if (!Object.keys(state.sessions).length) {
    try {
      const old = localStorage.getItem('mtrack-v1');
      if (old) { const o = JSON.parse(old); state.sessions = o.sessions || {}; state.activeId = o.activeId; }
    } catch {}
  }
  if (!Object.keys(state.sessions).length) { const id = newSession('May 2026'); state.activeId = id; }
  if (!state.activeId || !state.sessions[state.activeId]) state.activeId = Object.keys(state.sessions)[0];
}

function persist() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

function newSession(name) {
  const id = 'sess-' + Date.now();
  state.sessions[id] = { id, name, stocks: {}, createdAt: Date.now() };
  return id;
}

function active() { return state.sessions[state.activeId]; }

function blankStock(sym) {
  return {
    symbol: sym, name: sym,
    currentPrice: null, price6m: null,
    gain: null, gain12m: null, gain3m: null, gain1m: null,
    sma50: null, sma150: null, sma200: null, sma200ago22: null,
    high52w: null, low52w: null, rsRank: null,
    marketCap: null, avgVolume: null, adr: null,
    sector: '', industry: '',
    buyRank: null, fetchStatus: 'pending', fetchError: null, lastFetched: null,
  };
}
