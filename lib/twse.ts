export type Candle = { date: string; open: number; high: number; low: number; close: number };

export type OfficialStock = {
  code: string;
  name: string;
  price: number;
  change: number;
  volume: string;
  candles: Candle[];
};

type StockDayResponse = { stat?: string; title?: string; data?: string[][] };

const STOCK_DAY = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY';

const toNumber = (value: string) => Number(value.replace(/,/g, ''));

/** 回傳最近幾個月的查詢日期（由舊到新），格式為 YYYYMM01。 */
export function recentMonthDates(today: Date, months = 3) {
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (months - 1 - index), 1);
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}01`;
  });
}

/** STOCK_DAY 的 title 形如「115年08月 2330 台積電           各日成交資訊」。 */
export function nameFromTitle(title: string | undefined, code: string) {
  return title?.match(/\d+年\d+月\s+\S+\s+(\S+)/)?.[1] ?? code;
}

/** 民國日期 115/08/03 轉為圖表用的 08/03。 */
export function toDisplayDate(rocDate: string) {
  const [, month, day] = rocDate.split('/');
  return month && day ? `${month}/${day}` : rocDate;
}

/**
 * 只使用 www.twse.com.tw 的日成交資料（有回傳 access-control-allow-origin: *），
 * 避免 openapi.twse.com.tw 缺少 CORS 標頭導致瀏覽器直接擋下請求。
 */
export async function fetchOfficialStock(code: string, today = new Date()): Promise<OfficialStock> {
  const settled = await Promise.allSettled(
    recentMonthDates(today).map(async (date) => {
      const response = await fetch(`${STOCK_DAY}?response=json&date=${date}&stockNo=${code}`);
      if (!response.ok) throw new Error(`證交所公開資料回應 ${response.status}`);
      return await response.json() as StockDayResponse;
    }),
  );
  const months = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  if (!months.length) throw new Error('目前無法連線證交所公開資料');

  const listed = months.filter((month) => month.stat === 'OK');
  if (!listed.length) throw new Error('找不到此上市股票代號');

  const rows = listed.flatMap((month) => month.data ?? []).sort((a, b) => a[0].localeCompare(b[0]));
  const daily = rows.map((row) => ({
    candle: {
      date: toDisplayDate(row[0]), open: toNumber(row[3]), high: toNumber(row[4]),
      low: toNumber(row[5]), close: toNumber(row[6]),
    },
    shares: toNumber(row[1]),
  })).filter(({ candle }) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
  if (!daily.length) throw new Error('此股票目前沒有可用的日成交資料');

  const candles = daily.map(({ candle }) => candle);
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? latest;
  return {
    code,
    name: nameFromTitle(listed.at(-1)?.title, code),
    price: latest.close,
    change: Number((latest.close - previous.close).toFixed(2)),
    volume: `${Math.round(daily[daily.length - 1].shares / 1000).toLocaleString('zh-TW')} 張`,
    candles,
  };
}

export type DailyQuote = {
  code: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  shares: number;
  amount: number;
};

export type MarketIndex = { name: string; close: number; change: number; percent: number };

export type MarketBreadth = { up: number; upLimit: number; down: number; downLimit: number; flat: number };

export type MarketSnapshot = {
  date: string;
  quotes: Record<string, DailyQuote>;
  indices: MarketIndex[];
  breadth: MarketBreadth | null;
  turnover: { amount: number; shares: number; trades: number } | null;
};

const MI_INDEX = 'https://www.twse.com.tw/exchangeReport/MI_INDEX';

const toYmd = (date: Date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

const stripTags = (value: string) => value.replace(/<[^>]*>/g, '').trim();

/** 每日收盤行情的漲跌欄位帶有 HTML，例如 <p style= color:red>+</p>。 */
export function parseQuoteRow(row: string[]): DailyQuote | null {
  const close = toNumber(row[8]);
  if (!Number.isFinite(close)) return null;
  const diff = toNumber(row[10]);
  const falling = stripTags(row[9]).includes('-');
  return {
    code: row[0], name: row[1], open: toNumber(row[5]), high: toNumber(row[6]), low: toNumber(row[7]), close,
    change: Number.isFinite(diff) ? (falling ? -diff : diff) : 0,
    shares: toNumber(row[2]), amount: toNumber(row[4]),
  };
}

/** 指數表的漲跌點數是絕對值，方向放在另一欄的 HTML 裡。 */
export function parseIndexRow(row: string[]): MarketIndex | null {
  const close = toNumber(row[1]);
  if (!Number.isFinite(close)) return null;
  const points = toNumber(row[3]);
  const percent = toNumber(row[4]);
  const falling = stripTags(row[2]).includes('-');
  return {
    name: row[0], close,
    change: Number.isFinite(points) ? (falling ? -points : points) : 0,
    percent: Number.isFinite(percent) ? percent : 0,
  };
}

/** 漲跌家數欄位形如「209(5)」，括號內是漲停或跌停家數。 */
function parseBreadthCell(value: string) {
  const matched = value.match(/([\d,]+)(?:\((\d+)\))?/);
  return { count: matched ? toNumber(matched[1]) : 0, limit: matched?.[2] ? Number(matched[2]) : 0 };
}

/**
 * 一次取得當日大盤概況與全部上市個股收盤行情；當天非交易日時往前尋找最近的交易日。
 * 指數、成交統計、漲跌家數與個股報價都來自同一個請求。
 */
export async function fetchMarketSnapshot(today = new Date(), lookbackDays = 10): Promise<MarketSnapshot> {
  for (let offset = 0; offset <= lookbackDays; offset += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const response = await fetch(`${MI_INDEX}?response=json&date=${toYmd(day)}&type=ALLBUT0999`);
    if (!response.ok) continue;
    const payload = await response.json() as { stat?: string; tables?: { fields?: string[]; data?: string[][] }[] };
    if (payload.stat !== 'OK') continue;
    const tables = payload.tables ?? [];
    const quotes: Record<string, DailyQuote> = {};
    for (const row of tables.find((item) => item.fields?.[0] === '證券代號')?.data ?? []) {
      const quote = parseQuoteRow(row);
      if (quote) quotes[quote.code] = quote;
    }
    if (!Object.keys(quotes).length) continue;

    const indices = tables
      .filter((item) => item.fields?.[0] === '指數')
      .flatMap((item) => item.data ?? [])
      .map(parseIndexRow)
      .filter((item): item is MarketIndex => item !== null);

    const breadthRows = tables.find((item) => item.fields?.[0] === '類型')?.data ?? [];
    const cellFor = (label: string) => parseBreadthCell(breadthRows.find((row) => row[0].startsWith(label))?.[2] ?? '');
    const rising = cellFor('上漲');
    const falling = cellFor('下跌');
    const breadth = breadthRows.length
      ? { up: rising.count, upLimit: rising.limit, down: falling.count, downLimit: falling.limit, flat: cellFor('持平').count }
      : null;

    const totalRow = (tables.find((item) => item.fields?.[0] === '成交統計')?.data ?? [])
      .find((row) => row[0].startsWith('證券合計'));
    const turnover = totalRow
      ? { amount: toNumber(totalRow[1]), shares: toNumber(totalRow[2]), trades: toNumber(totalRow[3]) }
      : null;

    return { date: toYmd(day), quotes, indices, breadth, turnover };
  }
  throw new Error('無法取得當日收盤行情');
}

export type InstitutionalFlow = {
  code: string;
  name: string;
  /** 外資（外陸資 + 外資自營商），單位為張。 */
  foreign: number;
  trust: number;
  dealer: number;
  total: number;
};

const T86 = 'https://www.twse.com.tw/fund/T86';

const toLots = (value: string) => toNumber(value) / 1000;

/** 三大法人買賣超日報只有代號、名稱與各法人的買賣超股數。 */
export function parseFlowRow(row: string[]): InstitutionalFlow | null {
  const code = row[0]?.trim() ?? '';
  if (!/^\d{4}$/.test(code)) return null;
  const foreign = toLots(row[4]) + toLots(row[7]);
  const trust = toLots(row[10]);
  const dealer = toLots(row[11]);
  const total = toLots(row[18]);
  if (![foreign, trust, dealer, total].every(Number.isFinite)) return null;
  return { code, name: row[1].trim(), foreign, trust, dealer, total };
}

/** 指定交易日的三大法人買賣超（單位：張），只保留 4 位數代號的上市個股。 */
export async function fetchInstitutionalFlows(date: string): Promise<InstitutionalFlow[]> {
  const response = await fetch(`${T86}?response=json&date=${date}&selectType=ALL`);
  if (!response.ok) throw new Error('三大法人資料暫時無法讀取');
  const payload = await response.json() as { stat?: string; data?: string[][] };
  if (payload.stat !== 'OK') throw new Error('當日沒有三大法人買賣超資料');
  const flows = (payload.data ?? []).map(parseFlowRow).filter((item): item is InstitutionalFlow => item !== null);
  if (!flows.length) throw new Error('當日沒有三大法人買賣超資料');
  return flows;
}
