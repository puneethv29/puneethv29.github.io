const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSONSafe(url, { skipDirect = false, proxyStartIdx = 0 } = {}) {
  const rotated = [...PROXIES.slice(proxyStartIdx), ...PROXIES.slice(0, proxyStartIdx)];
  const attempts = [
    ...(!skipDirect ? [() => fetch(url, { cache: 'no-store' })] : []),
    ...rotated.map(p => () => fetch(p + encodeURIComponent(url), { cache: 'no-store' })),
  ];
  let lastErr = new Error('All fetch attempts failed');
  for (const attempt of attempts) {
    try {
      const r = await attempt();
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); continue; }
      const text = await r.text();
      const t = text.trimStart();
      if (t[0] !== '{' && t[0] !== '[') {
        lastErr = new Error('Proxy returned HTML — all proxies may be down or rate-limited. Wait a moment and try again.');
        continue;
      }
      return JSON.parse(text);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Weekly interval: 10W ≈ SMA50, 30W ≈ SMA150, 40W ≈ SMA200 (Minervini uses weekly charts).
// Fetching weekly data is ~5x smaller per request than daily, allowing higher concurrency.
async function fetchYF(symbol, proxyStartIdx = 0) {
  const path  = encodeURIComponent(symbol) + '?range=1y&interval=1wk';
  const hosts = [
    'https://query1.finance.yahoo.com/v8/finance/chart/',
    'https://query2.finance.yahoo.com/v8/finance/chart/',
  ];
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await delay(1000 * attempt);
      const yf   = hosts[attempt % 2] + path;
      const json = await fetchJSONSafe(yf, {
        skipDirect:    true,
        proxyStartIdx: (proxyStartIdx + attempt) % PROXIES.length,
      });
      if (json.chart?.error) throw new Error(json.chart.error.description || 'API error');
      const res = json.chart?.result?.[0];
      if (!res) throw new Error('No data');

      const meta   = res.meta;
      const closes = res.indicators?.adjclose?.[0]?.adjclose || res.indicators?.quote?.[0]?.close || [];
      const highs  = res.indicators?.quote?.[0]?.high || closes;
      const lows   = res.indicators?.quote?.[0]?.low  || closes;
      const valid  = closes.filter(c => c != null);

      // Lookback indices (weekly bars)
      const idx26w = Math.max(0, closes.length - 26); // ~6M
      const idx13w = Math.max(0, closes.length - 13); // ~3M
      const idx4w  = Math.max(0, closes.length - 4);  // ~1M

      const findClose = startIdx => {
        for (let i = startIdx; i < closes.length; i++) if (closes[i] != null) return closes[i];
        for (let i = 0; i < closes.length; i++)        if (closes[i] != null) return closes[i];
        return null;
      };

      const price12m = valid.length ? valid[0] : null;
      const price6m  = findClose(idx26w);
      const price3m  = findClose(idx13w);
      const price1m  = findClose(idx4w);

      // Weekly SMA periods: 10W≈SMA50, 30W≈SMA150, 40W≈SMA200, 4W offset≈22 trading days
      const sma50       = smaLast(closes, 10);
      const sma150      = smaLast(closes, 30);
      const sma200      = smaLast(closes, 40);
      const sma200ago22 = smaAgo(closes, 40, 4);

      // 52W high/low from weekly bar highs/lows
      const validH = highs.filter(h => h != null);
      const validL = lows.filter(l => l != null);
      const high52w = validH.length ? Math.max(...validH) : (valid.length ? Math.max(...valid) : null);
      const low52w  = validL.length ? Math.min(...validL) : (valid.length ? Math.min(...valid) : null);

      // ADR: average weekly range over last 4 weeks as % of close
      let adrSum = 0, adrN = 0;
      for (let i = idx4w; i < closes.length; i++) {
        if (highs[i] != null && lows[i] != null && closes[i]) {
          adrSum += (highs[i] - lows[i]) / closes[i] * 100;
          adrN++;
        }
      }

      const cur    = meta.regularMarketPrice ?? null;
      const pct    = (base, cur) => (cur != null && base != null && base !== 0) ? (cur - base) / base * 100 : null;

      return {
        name:         meta.longName || meta.shortName || symbol,
        currentPrice: cur,
        price6m,
        gain:         pct(price6m,  cur),
        gain12m:      pct(price12m, cur),
        gain3m:       pct(price3m,  cur),
        gain1m:       pct(price1m,  cur),
        sma50, sma150, sma200, sma200ago22,
        high52w, low52w,
        marketCap:    meta.marketCap ?? null,
        avgVolume:    meta.averageVolume || meta.regularMarketVolume || null,
        adr:          adrN ? adrSum / adrN : null,
        fetchStatus:  'ok', fetchError: null, lastFetched: Date.now(),
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
