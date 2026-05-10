const STORE_KEY        = 'mtrack-v2';
const PROXIES          = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
];
const PROXY            = PROXIES[0];
const QUEUE_CONCURRENCY = 8;
const YF_CHART         = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const NASDAQ_SCREENER  = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0';
const EDGAR_EXCH_URL   = 'https://www.sec.gov/files/company_tickers_exchange.json';
const EDGAR_BASE_URL   = 'https://www.sec.gov/files/company_tickers.json';
