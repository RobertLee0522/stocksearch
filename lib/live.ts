/**
 * 盤中即時報價。
 *
 * 證交所的即時端點 mis.twse.com.tw 不回 CORS 標頭，瀏覽器無法直接取用，
 * 因此由 worker/quote-proxy.ts 代為轉發；這個檔案同時被 Worker 與前端使用，
 * 解析邏輯只有一份。未設定代理時前端會維持只顯示收盤資料。
 */

export const MIS_ENDPOINT = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp';

export type LiveQuote = {
  code: string;
  name: string;
  price: number;
  previous: number;
  change: number;
  percent: number;
  open: number;
  high: number;
  low: number;
  /** 當日累計成交量，單位為張。 */
  volume: number;
  /** 證交所提供的資料時間，格式 HH:MM:SS。 */
  time: string;
  /** 證交所提供的資料日期，格式 YYYYMMDD。 */
  date: string;
  /** 是否為實際成交價；尚未成交時以最佳買賣中價或昨收替代。 */
  traded: boolean;
};

type MisRow = Record<string, string | undefined>;

const toNumber = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/** 最佳五檔是以底線串接的字串，例如 "42.85_42.90_42.95_"。 */
const bestTier = (value: string | undefined) => toNumber(value?.split('_')[0]);

/** 只取上市（tse），與站上其他資料的範圍一致。 */
export const misChannels = (codes: string[]) => codes.map((code) => `tse_${code}.tw`).join('|');

export const isStockCode = (code: string) => /^\d{4,6}$/.test(code);

export function parseLiveRow(row: MisRow): LiveQuote | null {
  const code = row.c?.trim() ?? '';
  if (!isStockCode(code)) return null;
  const previous = toNumber(row.y);
  const last = toNumber(row.z);
  const traded = Number.isFinite(last);
  // 尚未成交時 z 會是 "-"，改用最佳買賣中價，再沒有就退回昨收，避免畫面出現空值。
  const bid = bestTier(row.b);
  const ask = bestTier(row.a);
  const middle = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : Number.NaN;
  const price = traded ? last : Number.isFinite(middle) ? middle : previous;
  if (!Number.isFinite(price)) return null;
  const change = Number.isFinite(previous) ? Number((price - previous).toFixed(2)) : 0;
  return {
    code,
    name: row.n?.trim() || code,
    price,
    previous: Number.isFinite(previous) ? previous : price,
    change,
    percent: Number.isFinite(previous) && previous > 0 ? change / previous * 100 : 0,
    open: toNumber(row.o),
    high: toNumber(row.h),
    low: toNumber(row.l),
    volume: toNumber(row.v),
    time: row.t?.trim() ?? '',
    date: row.d?.trim() ?? '',
    traded,
  };
}

export function parseLivePayload(payload: { msgArray?: MisRow[] }): LiveQuote[] {
  return (payload.msgArray ?? [])
    .map(parseLiveRow)
    .filter((quote): quote is LiveQuote => quote !== null);
}

/** 台北時間週一至週五 09:00–13:35 視為盤中，只有這段時間才需要重複輪詢。 */
export function isMarketOpen(now = new Date()) {
  const taipei = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60_000);
  const day = taipei.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = taipei.getHours() * 60 + taipei.getMinutes();
  return minutes >= 9 * 60 && minutes <= 13 * 60 + 35;
}

const PROXY_KEY = 'chip-radar.quote-proxy';

/** 建置時可用 VITE_QUOTE_PROXY 預設，使用者也能在畫面上自行填入自己的代理網址。 */
function buildTimeProxy() {
  const meta = import.meta as { env?: Record<string, string | undefined> };
  return meta.env?.VITE_QUOTE_PROXY ?? '';
}

export function readProxyBase(): string {
  try {
    return globalThis.localStorage?.getItem(PROXY_KEY) ?? buildTimeProxy();
  } catch {
    return buildTimeProxy();
  }
}

export function writeProxyBase(base: string) {
  try {
    if (base) globalThis.localStorage?.setItem(PROXY_KEY, base);
    else globalThis.localStorage?.removeItem(PROXY_KEY);
  } catch {
    // 無痕模式可能拒絕寫入，這次啟用仍然有效，只是下次開啟要重設。
  }
}

/** 向代理取得即時報價；代理已經整理成 LiveQuote，這裡只做基本形狀檢查。 */
export async function fetchLiveQuotes(base: string, codes: string[]): Promise<LiveQuote[]> {
  const wanted = [...new Set(codes.filter(isStockCode))].slice(0, 25);
  if (!base || !wanted.length) return [];
  const response = await fetch(`${base.replace(/\/+$/, '')}/quote?codes=${wanted.join(',')}`);
  if (!response.ok) throw new Error(`即時報價代理回應 ${response.status}`);
  const payload = await response.json() as { quotes?: LiveQuote[]; message?: string };
  if (!Array.isArray(payload.quotes)) throw new Error(payload.message || '即時報價代理回應格式不符');
  return payload.quotes.filter((quote) => isStockCode(quote?.code ?? '') && Number.isFinite(quote?.price));
}
