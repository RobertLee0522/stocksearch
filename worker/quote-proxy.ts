/**
 * 盤中即時報價代理。
 *
 * 證交所 mis.twse.com.tw 不回 Access-Control-Allow-Origin，瀏覽器無法直接呼叫，
 * 因此由這個 Worker 代為轉發並補上 CORS 標頭。部署方式見 worker/README.md。
 *
 * 只接受 GET /quote?codes=2330,2317，代號會先驗證再組成證交所的查詢字串，
 * 因此它不是一個可以轉發任意網址的開放代理。
 */
import { MIS_ENDPOINT, misChannels, parseLivePayload } from '../lib/live';

export type Env = {
  /** 以逗號分隔的允許來源；未設定時允許任何來源。 */
  ALLOWED_ORIGINS?: string;
};

const MAX_CODES = 25;
/** 報價每 5 秒才會有意義的變化，快取這麼短既不失即時性，也能擋掉重複請求。 */
const CACHE_SECONDS = 5;

function allowOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!allowed.length) return '*';
  return allowed.includes(origin) ? origin : '';
}

function headersFor(origin: string, seconds: number): Record<string, string> {
  return {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin || 'null',
    'access-control-allow-methods': 'GET,OPTIONS',
    'vary': 'Origin',
    'cache-control': `public, max-age=${seconds}`,
  };
}

const fail = (status: number, message: string, origin: string) =>
  new Response(JSON.stringify({ message }), { status, headers: headersFor(origin, 0) });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowOrigin(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headersFor(origin, 0) });
    if (request.method !== 'GET') return fail(405, '只接受 GET', origin);
    if (!origin) return fail(403, '此來源未被允許', origin);

    const url = new URL(request.url);
    if (url.pathname !== '/quote') return fail(404, '請使用 /quote?codes=2330', origin);

    const codes = [...new Set((url.searchParams.get('codes') ?? '').split(',').map((code) => code.trim()))]
      .filter((code) => /^\d{4,6}$/.test(code))
      .slice(0, MAX_CODES);
    if (!codes.length) return fail(400, '請以 codes 帶入 4 到 6 位股票代號', origin);

    const query = `${MIS_ENDPOINT}?ex_ch=${encodeURIComponent(misChannels(codes))}&json=1&delay=0&_=${Date.now()}`;
    let upstream: Response;
    try {
      upstream = await fetch(query, {
        headers: {
          // 證交所即時頁面會帶這些標頭，少了有時會被擋下。
          'referer': 'https://mis.twse.com.tw/stock/fibest.jsp',
          'user-agent': 'Mozilla/5.0 (compatible; stocksearch/1.0)',
          'accept': 'application/json, text/plain, */*',
        },
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });
    } catch {
      return fail(502, '無法連線證交所即時資料', origin);
    }
    if (!upstream.ok) return fail(502, `證交所即時資料回應 ${upstream.status}`, origin);

    const payload = await upstream.json() as { msgArray?: Record<string, string | undefined>[]; rtcode?: string };
    // rtcode 0000 才是正常回應；其餘多半是查詢被拒或代號有誤。
    if (payload.rtcode && payload.rtcode !== '0000') return fail(502, `證交所即時資料代碼 ${payload.rtcode}`, origin);

    const quotes = parseLivePayload(payload);
    return new Response(JSON.stringify({ at: new Date().toISOString(), quotes }), {
      headers: headersFor(origin, CACHE_SECONDS),
    });
  },
} satisfies ExportedHandler<Env>;
