const delay = ms => new Promise(r => setTimeout(r, ms));

// fetchJSONSafe is kept for the EDGAR fallback in universe.js (SEC has CORS headers,
// so direct browser fetches work; proxies are the fallback for edge cases).
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
        lastErr = new Error('Unexpected HTML response — endpoint may be down.');
        continue;
      }
      return JSON.parse(text);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Calls our own /api/chart serverless function which uses yahoo-finance2 server-side.
// No proxies, no CORS, no 401s.
async function fetchYF(symbol) {
  const url = `/api/chart?symbol=${encodeURIComponent(symbol)}`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await delay(1500);
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || 'HTTP ' + r.status);
      }
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
