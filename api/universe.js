// Fetches the NASDAQ screener server-side — no CORS or proxy needed.
// Returns filtered rows ready for the frontend to import.
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1-hour cache — universe composition doesn't change minute-to-minute
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');

  const { exchange = 'nasdaq,nyse', minMcap = '0' } = req.query;
  const minMcapNum = parseFloat(minMcap) || 0;

  const exchanges = [];
  if (exchange.includes('nasdaq')) exchanges.push('nasdaq');
  if (exchange.includes('nyse'))   exchanges.push('nyse');
  if (!exchanges.length) exchanges.push('nasdaq', 'nyse');

  try {
    const rows = [];
    for (const exch of exchanges) {
      const url = `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&exchange=${exch}`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; momentum-tracker/1.0)',
          'Accept':     'application/json',
        },
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.data?.rows) rows.push(...data.data.rows);
    }

    if (!rows.length) {
      return res.status(502).json({ error: 'NASDAQ screener returned no data' });
    }

    const parseN = s => parseFloat(String(s || '').replace(/[^0-9.]/g, '')) || null;

    const filtered = rows
      .filter(row => {
        if (!row.symbol || !/^[A-Z.\-]{1,12}$/.test(row.symbol)) return false;
        const mcap = parseN(row.marketCap) ?? 0;
        return mcap >= minMcapNum;
      })
      .map(row => ({
        symbol:       (row.symbol || '').toUpperCase().trim(),
        name:         row.name     || '',
        marketCap:    parseN(row.marketCap),
        currentPrice: parseN(row.lastsale),
        avgVolume:    parseN(row.volume),
        sector:       row.sector   || '',
        industry:     row.industry || '',
      }));

    res.json({ rows: filtered });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
