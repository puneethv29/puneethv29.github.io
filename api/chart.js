const yahooFinance = require('yahoo-finance2').default;

// Suppress the validation survey prompt that yahoo-finance2 logs on first run
yahooFinance.setGlobalConfig({ validation: { logOptionsErrors: false } });

function smaLast(arr, n) {
  const v = arr.filter(x => x != null);
  if (v.length < n) return null;
  return v.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function smaAgo(arr, n, offset) {
  const v = arr.filter(x => x != null);
  if (v.length < n + offset) return null;
  return v.slice(-(n + offset), v.length - offset).reduce((a, b) => a + b, 0) / n;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const symbol = (req.query.symbol || '').toUpperCase().trim();
  if (!symbol || !/^[A-Z.\-]{1,12}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  // 15-minute cache — matches Yahoo Finance's own delay
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=60');

  try {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 1);

    const [chartResult, summary] = await Promise.all([
      yahooFinance.chart(symbol, { period1, interval: '1wk' }),
      yahooFinance.quoteSummary(symbol, { modules: ['price', 'summaryDetail'] }),
    ]);

    const quotes = chartResult.quotes || [];
    const closes = quotes.map(q => q.adjclose ?? q.close ?? null);
    const highs  = quotes.map(q => q.high ?? null);
    const lows   = quotes.map(q => q.low  ?? null);
    const n      = closes.length;

    // Find first non-null close starting at or after startIdx
    const findClose = startIdx => {
      for (let i = startIdx; i < n; i++) if (closes[i] != null) return closes[i];
      return closes.find(c => c != null) ?? null;
    };

    const price12m = closes.find(c => c != null) ?? null;
    const price6m  = findClose(Math.max(0, n - 26));
    const price3m  = findClose(Math.max(0, n - 13));
    const price1m  = findClose(Math.max(0, n - 4));
    const cur      = summary.price?.regularMarketPrice ?? closes[n - 1] ?? null;
    const pct      = (base, c) => (c != null && base && base !== 0) ? (c - base) / base * 100 : null;

    const validH = highs.filter(h => h != null);
    const validL = lows.filter(l => l != null);

    let adrSum = 0, adrN = 0;
    for (let i = Math.max(0, n - 4); i < n; i++) {
      if (highs[i] != null && lows[i] != null && closes[i]) {
        adrSum += (highs[i] - lows[i]) / closes[i] * 100;
        adrN++;
      }
    }

    res.json({
      name:         summary.price?.longName || summary.price?.shortName || symbol,
      currentPrice: cur,
      price6m,
      gain:    pct(price6m,  cur),
      gain12m: pct(price12m, cur),
      gain3m:  pct(price3m,  cur),
      gain1m:  pct(price1m,  cur),
      // Weekly SMA periods: 10W≈SMA50, 30W≈SMA150, 40W≈SMA200
      sma50:       smaLast(closes, 10),
      sma150:      smaLast(closes, 30),
      sma200:      smaLast(closes, 40),
      sma200ago22: smaAgo(closes, 40, 4),
      high52w: validH.length ? Math.max(...validH) : null,
      low52w:  validL.length ? Math.min(...validL) : null,
      marketCap: summary.price?.marketCap ?? summary.summaryDetail?.marketCap ?? null,
      avgVolume: summary.price?.averageDailyVolume3Month ?? summary.summaryDetail?.averageVolume ?? null,
      adr:       adrN ? adrSum / adrN : null,
      fetchStatus: 'ok', fetchError: null, lastFetched: Date.now(),
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
