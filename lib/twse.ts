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
