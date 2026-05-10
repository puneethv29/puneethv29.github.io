const TT_LABELS = [
  'Price > SMA150 & SMA200',
  'SMA150 > SMA200',
  'SMA200 trending up (1+ month)',
  'SMA50 > SMA150 & SMA200',
  'Price > SMA50',
  '30%+ above 52-week low',
  'Within 25% of 52-week high',
  'RS Rank ≥ 70 (within universe)',
];

function smaLast(arr, n) {
  const v = arr.filter(x => x != null);
  if (v.length < n) return null;
  const sl = v.slice(-n);
  return sl.reduce((a, b) => a + b, 0) / n;
}

function smaAgo(arr, n, offset) {
  const v = arr.filter(x => x != null);
  if (v.length < n + offset) return null;
  const sl = v.slice(-(n + offset), v.length - offset);
  return sl.reduce((a, b) => a + b, 0) / n;
}

function evalTT(s) {
  const p = s.currentPrice;
  const checks = [
    p != null && s.sma150 != null && s.sma200 != null && p > s.sma150 && p > s.sma200,
    s.sma150 != null && s.sma200 != null && s.sma150 > s.sma200,
    s.sma200 != null && s.sma200ago22 != null && s.sma200 > s.sma200ago22,
    s.sma50 != null && s.sma150 != null && s.sma200 != null && s.sma50 > s.sma150 && s.sma50 > s.sma200,
    p != null && s.sma50 != null && p > s.sma50,
    p != null && s.low52w != null && p >= s.low52w * 1.30,
    p != null && s.high52w != null && p <= s.high52w * 1.25,
    s.rsRank != null && s.rsRank >= 70,
  ];
  return { checks, score: checks.filter(Boolean).length };
}

// Weighted multi-period RS score modelled after IBD methodology.
// 40% weight on 12M return (trend), 20% each on 6M/3M/1M (recency).
// Stocks with strong recent momentum score higher than those that peaked
// long ago, giving a more accurate read on current relative strength.
function computeRSRanks(sessId) {
  const sess = state.sessions[sessId];
  if (!sess) return;
  const stocks = Object.values(sess.stocks).filter(s => s.gain12m != null);
  if (!stocks.length) return;

  stocks.forEach(s => {
    const g12 = s.gain12m ?? 0;
    // Fall back gracefully when shorter-period data isn't available yet
    const g6  = s.gain   ?? g12 * 0.5;
    const g3  = s.gain3m ?? g12 * 0.25;
    const g1  = s.gain1m ?? g12 * 0.083;
    s._rsScore = 0.4 * g12 + 0.2 * g6 + 0.2 * g3 + 0.2 * g1;
  });

  stocks.sort((a, b) => a._rsScore - b._rsScore);
  stocks.forEach((s, i) => {
    s.rsRank = Math.round((i + 1) / stocks.length * 100);
  });
  Object.values(sess.stocks).forEach(s => {
    if (s.gain12m == null) s.rsRank = null;
  });
}
