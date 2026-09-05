'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Bell, Building2, ChevronDown, ExternalLink, Landmark,
  Menu, Search, ShieldAlert, Star, TrendingDown, TrendingUp, Users,
  WalletCards, X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FlowRanking, formatDate, lots, MarketOverview } from '@/app/market-panels';
import {
  eachDailyChips, fetchMarketSnapshot, fetchOfficialStock,
  type Candle, type DailyQuote, type InstitutionalFlow, type MarginTrade, type MarketSnapshot, type OfficialStock,
} from '@/lib/twse';
import { readWatchlist, searchStocks, type StockOption, writeWatchlist } from '@/lib/watchlist';

/** 每次要部署時手動遞增，方便從畫面確認線上版本是否已更新。 */
const APP_VERSION = 'v2026.09.04-4';

type Seed = {
  code: string;
  name: string;
  industry: string;
};

type Stock = Seed & { price: number; change: number; volume: string; candles: Candle[] };

const views = ['市場總覽', '個股研究', '籌碼排行'] as const;

type View = typeof views[number];

const ranges = ['5日', '20日', '60日'] as const;

type Range = typeof ranges[number];

const parties = ['外資', '投信', '自營商', '三大法人', '融資'] as const;

type Party = typeof parties[number];

/** 證交所沒有公布散戶買賣超，融資餘額增減是市場慣用的散戶動向代理指標。 */
const partyLabel = (party: Party) => (party === '融資' ? '融資餘額增減（散戶動向）' : `${party}買賣超`);

/** 日 K 與買賣超長條共用同一組座標，兩張圖的同一天才會對齊在同一個 x。 */
const chart = { width: 760, left: 48, right: 12 };

/** 一個交易日的收盤價、法人買賣超與融資餘額；報表還沒到齊時為 null。 */
type FlowRow = {
  ymd: string;
  date: string;
  close: number;
  flow: InstitutionalFlow | null;
  margin: MarginTrade | null;
  loaded: boolean;
};

/** 各法人為當日買賣超（張），融資為餘額增減（張）；沒有該日資料時回傳 null。 */
function rowValue(row: FlowRow, party: Party): number | null {
  if (party === '融資') return row.margin ? row.margin.change : null;
  if (!row.flow) return null;
  return party === '外資' ? row.flow.foreign
    : party === '投信' ? row.flow.trust
    : party === '自營商' ? row.flow.dealer
    : row.flow.total;
}

/** 內建名單提供產業標籤與自選清單的預設值；價格與籌碼一律取自證交所公開資料。 */
const seeds: Seed[] = [
  { code: '2330', name: '台積電', industry: '半導體業' },
  { code: '2454', name: '聯發科', industry: '半導體業' },
  { code: '2317', name: '鴻海', industry: '其他電子業' },
  { code: '2382', name: '廣達', industry: '電腦及週邊設備業' },
  { code: '2303', name: '聯電', industry: '半導體業' },
  { code: '0050', name: '元大台灣50', industry: 'ETF' },
  { code: '2603', name: '長榮', industry: '航運業' },
  { code: '2308', name: '台達電', industry: '電子零組件業' },
  { code: '2881', name: '富邦金', industry: '金融保險業' },
  { code: '2882', name: '國泰金', industry: '金融保險業' },
  { code: '2886', name: '兆豐金', industry: '金融保險業' },
  { code: '1301', name: '台塑', industry: '塑膠工業' },
  { code: '1303', name: '南亞', industry: '塑膠工業' },
  { code: '2002', name: '中鋼', industry: '鋼鐵工業' },
  { code: '2412', name: '中華電', industry: '通信網路業' },
];

/** 第一次開啟網站時的自選清單。 */
const defaultWatchlist = seeds.map((seed) => seed.code);

const seedName = (code: string) => seeds.find((seed) => seed.code === code)?.name;

function toStock(official: OfficialStock): Stock {
  const seed = seeds.find((item) => item.code === official.code);
  return {
    code: official.code, name: official.name,
    industry: seed?.industry ?? '上市公司',
    price: official.price, change: official.change, volume: official.volume, candles: official.candles,
  };
}

export default function Home() {
  const [stock, setStock] = useState<Stock | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  // 三大法人日報以交易日為單位快取，點不同 K 棒時才不用重抓同一天。
  const [flowsByDate, setFlowsByDate] = useState<Record<string, InstitutionalFlow[]>>({});
  // 錯誤也要跟著日期記，否則換回有資料的日期時會留著前一天的錯誤訊息。
  const [flowErrors, setFlowErrors] = useState<Record<string, string>>({});
  const [marginsByDate, setMarginsByDate] = useState<Record<string, MarginTrade[]>>({});
  const [dataError, setDataError] = useState('');
  const [flowDate, setFlowDate] = useState('');
  const [range, setRange] = useState<Range>('20日');
  const [party, setParty] = useState<Party>('外資');
  // 已經送出過請求的日期，避免快取更新後又重複抓同一天。
  const requested = useRef<Set<string>>(new Set());
  const [view, setView] = useState<View>('個股研究');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [notice, setNotice] = useState('正在載入證交所公開資料…');
  const [watchlist, setWatchlist] = useState<string[]>(defaultWatchlist);
  const [restored, setRestored] = useState(false);
  // 每次 render 都建新物件會讓下方的 useMemo 失效，跟著快照一起記住即可。
  const quotes = useMemo(() => snapshot?.quotes ?? {}, [snapshot]);
  const quoteDate = snapshot?.date ?? '';
  // 沒有指定日期時，看的就是最近一個交易日。
  const activeFlowDate = flowDate || quoteDate;
  const flows = flowsByDate[activeFlowDate] ?? null;
  const flowError = flowErrors[activeFlowDate] ?? '';
  const shown = range === '5日' ? 5 : range === '20日' ? 20 : 60;

  const shownCandles = useMemo(() => (stock?.candles ?? []).slice(-shown), [stock, shown]);

  /** 圖表與表格共用的資料：取最近 N 個交易日，把當日收盤價與該股的買賣超併在一起。 */
  const history = useMemo<FlowRow[]>(() => shownCandles.map((candle) => {
    const day = flowsByDate[candle.ymd];
    return {
      ymd: candle.ymd, date: candle.date, close: candle.close,
      flow: day?.find((item) => item.code === stock?.code) ?? null,
      margin: marginsByDate[candle.ymd]?.find((item) => item.code === stock?.code) ?? null,
      loaded: day !== undefined || flowErrors[candle.ymd] !== undefined,
    };
  }), [shownCandles, stock, flowsByDate, marginsByDate, flowErrors]);
  const latestFlows = flowsByDate[quoteDate] ?? null;
  const isUp = (stock?.change ?? 0) >= 0;
  const watched = !!stock && watchlist.includes(stock.code);

  /** 全市場清單以當日收盤行情為主，尚未載入時先用內建名單。 */
  const universe = useMemo<StockOption[]>(() => {
    const named = new Map(seeds.map((seed): [string, string] => [seed.code, seed.name]));
    for (const quote of Object.values(quotes)) {
      if (/^\d{4}$/.test(quote.code)) named.set(quote.code, quote.name);
    }
    return [...named].map(([code, name]) => ({ code, name }));
  }, [quotes]);

  /** 沒有輸入關鍵字時，下拉直接列出自選清單方便快速切換。 */
  const suggestions = useMemo<StockOption[]>(() => {
    if (query.trim()) return searchStocks(universe, query);
    return watchlist.slice(0, 8).map((code) => ({ code, name: quotes[code]?.name ?? seedName(code) ?? code }));
  }, [query, universe, watchlist, quotes]);

  async function lookupOfficialStock(code: string) {
    if (!/^\d{4}$/.test(code)) {
      setNotice('請輸入 4 位上市股票代號，例如 2486、2330。');
      return;
    }
    setLookupLoading(true);
    setSearchOpen(false);
    setQuery('');
    setNotice(`正在向證交所公開資料查詢 ${code}…`);
    try {
      const official = await fetchOfficialStock(code);
      setStock(toStock(official));
      setNotice(`已載入 ${official.code} ${official.name}。價格與日 K 線來自證交所公開日成交資料。`);
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : '查詢暫時失敗'}。目前僅支援上市股票，請稍後再試。`);
    } finally {
      setLookupLoading(false);
    }
  }

  useEffect(() => {
    fetchMarketSnapshot()
      .then(setSnapshot)
      .catch((error: unknown) => setDataError(error instanceof Error ? error.message : '證交所公開資料暫時無法讀取'));
    void lookupOfficialStock(seeds[0].code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 需要哪些交易日：目前看的那一天，加上圖表與表格要用的近 N 日，新的排前面先載。
  const wanted = useMemo(
    () => [...new Set([activeFlowDate, ...shownCandles.map((candle) => candle.ymd).reverse()])].filter(Boolean),
    [activeFlowDate, shownCandles],
  );

  // 三大法人日報一份約 300KB，因此限制併發、逐日回填，並且同一天只抓一次。
  useEffect(() => {
    const missing = wanted.filter((date) => !requested.current.has(date));
    if (!missing.length) return;
    for (const date of missing) requested.current.add(date);
    void eachDailyChips(missing, (date, chips) => {
      if (chips.flows) setFlowsByDate((cache) => ({ ...cache, [date]: chips.flows as InstitutionalFlow[] }));
      else setFlowErrors((cache) => ({ ...cache, [date]: '當日沒有三大法人買賣超資料' }));
      if (chips.margins) setMarginsByDate((cache) => ({ ...cache, [date]: chips.margins as MarginTrade[] }));
    });
  }, [wanted]);

  // 靜態網站會先產出預設清單的 HTML，所以掛載後才讀本機資料，避免 hydration 不一致。
  useEffect(() => {
    setWatchlist(readWatchlist(defaultWatchlist));
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) writeWatchlist(watchlist);
  }, [restored, watchlist]);

  function toggleWatch(code: string, name: string) {
    const remove = watchlist.includes(code);
    setWatchlist(remove ? watchlist.filter((item) => item !== code) : [code, ...watchlist]);
    setNotice(`${name} 已${remove ? '移出' : '加入'}自選清單，清單保存在這台裝置的瀏覽器。`);
  }

  function openStock(code: string) {
    setView('個股研究');
    void lookupOfficialStock(code);
  }

  async function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    await lookupOfficialStock(suggestions[0]?.code ?? query.trim());
  }

  return (
    <main className="min-h-screen bg-[#07131f] text-[#e9f1f6] selection:bg-[#24d6a5]/30">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#07131f]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 lg:px-7">
          <button className="flex items-center gap-2.5 text-left" onClick={() => setNotice('籌碼雷達 · 台股價格與籌碼工作台')}>
            <span className="grid size-9 place-items-center rounded-xl bg-[#24d6a5] text-[#06201c] shadow-[0_0_30px_rgba(36,214,165,.28)]"><Activity className="size-5" /></span>
            <span><strong className="block text-sm tracking-wide">籌碼雷達</strong><small className="block text-[10px] tracking-[.16em] text-[#8ca0ae]">TAIWAN STOCK DESK · {APP_VERSION}</small></span>
          </button>
          <nav className="hidden items-center gap-1 lg:flex">
            {views.map((item) => <button key={item} className={`rounded-lg px-3 py-2 text-sm ${item === view ? 'bg-white/8 text-white' : 'text-[#91a4b1] hover:text-white'}`} onClick={() => setView(item)}>{item}</button>)}
          </nav>
          <form onSubmit={submitSearch} className="relative ml-auto flex w-full max-w-md items-center gap-2">
            <label className="relative block min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#76909f]" /><Input aria-label="查詢股票代號或名稱" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} placeholder="查詢代號或名稱，例如 2330" className="h-10 border-white/10 bg-white/6 pl-9 text-sm text-white placeholder:text-[#78909e]" /></label>
            <Button type="submit" disabled={lookupLoading} className="h-10 bg-[#24d6a5] px-4 text-[#06201c] hover:bg-[#5ce6bf]">{lookupLoading ? '查詢中' : '查詢'}</Button>
            {searchOpen && <div className="absolute left-0 top-11 z-50 w-[calc(100%-74px)] overflow-hidden rounded-xl border border-white/10 bg-[#102638] shadow-2xl">
              {(!query.trim() || suggestions.length > 0) && <p className="border-b border-white/6 px-3 py-2 text-[10px] tracking-[.12em] text-[#7d93a1]">{query.trim() ? `符合的上市個股 · 前 ${suggestions.length} 筆` : '自選清單'}</p>}
              {suggestions.map((item) => <button type="button" key={item.code} onMouseDown={(event) => event.preventDefault()} onClick={() => void lookupOfficialStock(item.code)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/7"><span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs text-[#a9bbc5]">{item.code}</span><span className="flex-1 truncate text-sm">{item.name}</span><span className="font-mono text-xs text-[#8fa5b2]">{quotes[item.code]?.close.toLocaleString('zh-TW') ?? '—'}</span></button>)}
              {!suggestions.length && (/^\d{4}$/.test(query.trim())
                ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void lookupOfficialStock(query.trim())} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm hover:bg-white/7"><Search className="size-4 text-[#64dfbb]" /><span>查詢 <strong className="font-mono">{query.trim()}</strong> 的證交所公開資料</span></button>
                : <p className="px-3 py-3 text-sm text-[#93a7b3]">{query.trim() ? '找不到符合的上市個股，請改用 4 位代號查詢。' : '自選清單是空的，查詢個股後可用星號加入。'}</p>)}
            </div>}
          </form>
          <Button variant="ghost" size="icon" className="hidden text-[#a6b8c4] md:inline-flex" aria-label="通知"><Bell /></Button><Button variant="ghost" size="icon" className="text-[#a6b8c4] lg:hidden" aria-label="選單"><Menu /></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-7">
        <div role="status" className="mb-5 flex items-center gap-2 rounded-lg border border-[#d7a738]/20 bg-[#d7a738]/8 px-3 py-2 text-xs text-[#dcc979]"><ShieldAlert className="size-3.5" />{notice}</div>
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            {view === '市場總覽' ? <MarketOverview snapshot={snapshot} error={dataError} onSelect={openStock} />
              : view === '籌碼排行' ? <FlowRanking flows={latestFlows} quotes={quotes} quoteDate={quoteDate} error={dataError || (flowErrors[quoteDate] ?? '')} onSelect={openStock} />
              : <>
                {stock ? <>
                  <StockSummary stock={stock} up={isUp} watched={watched} onWatch={() => toggleWatch(stock.code, stock.name)} />
                  <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(370px,1fr)]">
                    <KlinePanel stock={stock} history={history} party={party} range={range} onRange={setRange} selectedDate={activeFlowDate} onPickDate={setFlowDate} />
                    <InstitutionPanel stock={stock} flow={flows?.find((item) => item.code === stock.code) ?? null} margin={marginsByDate[activeFlowDate]?.find((item) => item.code === stock.code) ?? null} loaded={flows !== null} date={activeFlowDate} latest={activeFlowDate === quoteDate} error={dataError || flowError} onLatest={() => setFlowDate('')} />
                  </section>
                  <FlowHistoryPanel stock={stock} history={history} party={party} onParty={setParty} selectedDate={activeFlowDate} onPickDate={setFlowDate} />
                </> : <section className="grid h-64 place-items-center rounded-2xl border border-white/8 bg-[#0b1d2c] text-sm text-[#8197a5]">正在載入證交所公開日成交資料…</section>}
                <OwnershipPanel />
              </>}
          </div>
          <aside className="space-y-5">
            <Watchlist codes={watchlist} activeCode={stock?.code ?? ''} quotes={quotes} quoteDate={quoteDate} onSelect={openStock} onRemove={(code, name) => toggleWatch(code, name)} />
            <SignalPanel />
            <section className="rounded-2xl border border-[#d7a738]/20 bg-gradient-to-br from-[#1e2a2b] to-[#0b1d2c] p-5"><p className="text-[10px] font-semibold tracking-[.14em] text-[#d7c479]">資料服務接入</p><h2 className="mt-2 text-base font-semibold">下一步：公開資料查詢</h2><p className="mt-2 text-xs leading-5 text-[#9cafb9]">可先接日收盤、法人買賣超與集保週資料；授權 API 則可再擴充盤中報價。</p><button className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#6ee5c1] hover:underline" onClick={() => setNotice('免費公開資料版可提供日資料與週籌碼；盤中逐筆行情需另行授權。')}>查看資料層級 <ChevronDown className="size-3 -rotate-90" /></button></section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function StockSummary({ stock, up, watched, onWatch }: { stock: Stock; up: boolean; watched: boolean; onWatch: () => void }) {
  const latest = stock.candles.at(-1);
  const percent = stock.change / (stock.price - stock.change) * 100;
  return <section className="grid gap-4 rounded-2xl border border-white/8 bg-[#0b1d2c] p-5 shadow-2xl shadow-black/10 md:grid-cols-[1.1fr_1fr_auto] md:items-center"><div className="flex items-start gap-3"><button aria-label={watched ? '移出自選清單' : '加入自選清單'} aria-pressed={watched} title={watched ? '移出自選清單' : '加入自選清單'} onClick={onWatch} className={`mt-1 rounded-lg p-1.5 hover:bg-[#d7a738]/10 ${watched ? 'text-[#d7a738]' : 'text-[#6f8593]'}`}><Star className={`size-5 ${watched ? 'fill-current' : ''}`} /></button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{stock.name}</h1><span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs text-[#9db0bd]">{stock.code}</span><span className="rounded bg-[#24d6a5]/12 px-1.5 py-0.5 text-[10px] font-semibold text-[#58e5bb]">{stock.industry}</span></div><p className="mt-2 text-xs text-[#8298a7]">證交所公開日成交資料 · 非盤中即時報價{latest ? ` · ${latest.date}` : ''}</p></div></div><div><div className={`font-mono text-4xl font-semibold tracking-tight ${up ? 'text-[#ff6d72]' : 'text-[#54d9a7]'}`}>{stock.price.toLocaleString('zh-TW', { minimumFractionDigits: 1 })}</div><div className={`mt-1 flex items-center gap-2 font-mono text-sm font-medium ${up ? 'text-[#ff6d72]' : 'text-[#54d9a7]'}`}>{up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}{up ? '+' : ''}{stock.change.toFixed(1)} <span>{up ? '+' : ''}{percent.toFixed(2)}%</span></div></div><div className="grid grid-cols-2 gap-x-5 text-right text-xs lg:grid-cols-4"><Quote label="今開" value={latest?.open.toFixed(1) ?? '—'} /><Quote label="最高" value={latest?.high.toFixed(1) ?? '—'} /><Quote label="最低" value={latest?.low.toFixed(1) ?? '—'} /><Quote label="總量" value={stock.volume} /></div></section>;
}

function KlinePanel({ stock, history, party, range, onRange, selectedDate, onPickDate }: {
  stock: Stock;
  history: FlowRow[];
  party: Party;
  range: Range;
  onRange: (range: Range) => void;
  selectedDate: string;
  onPickDate: (ymd: string) => void;
}) {
  // 兩張圖共用同一個游標位置，滑到哪一天，K 線與買賣超就一起標出同一天。
  const [hovered, setHovered] = useState(history.length - 1);
  useEffect(() => setHovered(history.length - 1), [history.length]);
  const data = (stock.candles ?? []).slice(-history.length);
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold">日 K 線 · {partyLabel(party)}</h2>
        <p className="mt-1 text-xs text-[#8197a5]">{stock.code} {stock.name} · 顯示 {data.length} 根 · 點 K 棒或長條可看該日籌碼</p>
      </div>
      <div className="flex rounded-lg bg-white/6 p-1 text-xs">
        {ranges.map((item) => <button type="button" key={item} onClick={() => onRange(item)} className={`rounded-md px-2.5 py-1.5 ${range === item ? 'bg-[#1f3848] text-white' : 'text-[#8ba0ad]'}`}>{item}</button>)}
      </div>
    </div>
    <CandlestickChart data={data} hovered={hovered} onHover={setHovered} selectedDate={selectedDate} onPick={onPickDate} />
    <FlowBars rows={history} party={party} hovered={hovered} onHover={setHovered} selectedDate={selectedDate} onPick={onPickDate} />
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#8197a5]">
      <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-[#ff6d72]" />收漲 K／{party === '融資' ? '融資增加' : '買超'}（零軸上）</span>
      <span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-[#24d6a5]" />收跌 K／{party === '融資' ? '融資減少' : '賣超'}（零軸下）</span>
      <span className="ml-auto">證交所日成交、三大法人日報與融資融券餘額</span>
    </div>
  </section>;
}

function CandlestickChart({ data, hovered, onHover, selectedDate, onPick }: {
  data: Candle[];
  hovered: number;
  onHover: (index: number) => void;
  selectedDate: string;
  onPick: (ymd: string) => void;
}) {
  const height = 290; const pad = { left: chart.left, right: chart.right, top: 16, bottom: 10 };
  const max = Math.max(...data.map((item) => item.high)); const min = Math.min(...data.map((item) => item.low)); const buffer = (max - min) * 0.14 || 1;
  const ceiling = max + buffer; const floor = min - buffer; const plotHeight = height - pad.top - pad.bottom; const plotWidth = chart.width - pad.left - pad.right;
  const y = (value: number) => pad.top + (ceiling - value) / (ceiling - floor) * plotHeight;
  const step = plotWidth / data.length; const candleWidth = Math.min(28, Math.max(3, step * 0.58)); const selected = data[hovered] ?? data[data.length - 1];
  const ticks = [ceiling, (ceiling * 2 + floor) / 3, (ceiling + floor * 2) / 3, floor];
  return <div className="relative h-[290px] w-full overflow-hidden">
    <svg aria-label="日 K 線圖" viewBox={`0 0 ${chart.width} ${height}`} className="h-full w-full"><title>日 K 線圖</title>
      {ticks.map((tick) => <g key={tick}>
        <line x1={pad.left} x2={chart.width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#ffffff12" />
        <text x={pad.left - 8} y={y(tick) + 4} fill="#718897" fontSize="11" textAnchor="end">{tick.toFixed(1)}</text>
      </g>)}
      {data.map((item, index) => {
        const x = pad.left + step * index + step / 2;
        const rise = item.close >= item.open;
        const color = rise ? '#ff6d72' : '#24d6a5';
        const bodyTop = y(Math.max(item.open, item.close));
        const bodyHeight = Math.max(2, Math.abs(y(item.open) - y(item.close)));
        const picked = item.ymd !== '' && item.ymd === selectedDate;
        return <g key={item.ymd || item.date} onMouseEnter={() => onHover(index)} onClick={() => onPick(item.ymd)} onTouchStart={() => { onHover(index); onPick(item.ymd); }} className="cursor-pointer">
          <rect x={x - step / 2} y={pad.top} width={step} height={plotHeight} fill={picked ? '#24d6a51e' : hovered === index ? '#ffffff08' : 'transparent'} />
          {picked && <rect x={x - step / 2} y={pad.top} width={step} height={plotHeight} fill="none" stroke="#24d6a5" strokeWidth="1" />}
          <line x1={x} x2={x} y1={y(item.high)} y2={y(item.low)} stroke={color} strokeWidth="1.5" />
          <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} rx="1" />
        </g>;
      })}
    </svg>
    <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-white/10 bg-[#102638]/95 px-3 py-2 font-mono text-[11px] text-[#bfd0d9] shadow-lg">
      <span className="mr-3 text-[#879ca9]">{selected.date}</span>
      開 {selected.open.toFixed(1)}　高 {selected.high.toFixed(1)}　低 {selected.low.toFixed(1)}　收 <strong className={selected.close >= selected.open ? 'text-[#ff8588]' : 'text-[#59e4bd]'}>{selected.close.toFixed(1)}</strong>
    </div>
  </div>;
}

/**
 * 買賣超長條，x 座標與上方日 K 完全相同，同一天在兩張圖會對齊。
 * 買超在零軸上、賣超在零軸下，方向本身就是第二種編碼，紅綠在色覺缺陷下不易分辨時仍可判讀。
 */
function FlowBars({ rows, party, hovered, onHover, selectedDate, onPick }: {
  rows: FlowRow[];
  party: Party;
  hovered: number;
  onHover: (index: number) => void;
  selectedDate: string;
  onPick: (ymd: string) => void;
}) {
  const height = 130; const pad = { left: chart.left, right: chart.right, top: 12, bottom: 22 };
  const plotHeight = height - pad.top - pad.bottom; const plotWidth = chart.width - pad.left - pad.right;
  const values = rows.map((row) => rowValue(row, party) ?? 0);
  const scale = Math.max(...values.map(Math.abs), 1);
  const zero = pad.top + plotHeight / 2;
  const y = (value: number) => zero - value / scale * (plotHeight / 2);
  const step = plotWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(2, Math.min(22, step - 2));
  const day = rows[hovered];
  const hoveredValue = day ? rowValue(day, party) : null;
  const labelEvery = Math.ceil(rows.length / 6);
  return <div className="relative mt-1 h-[130px] w-full overflow-hidden">
    <svg aria-label={`${partyLabel(party)}長條圖`} viewBox={`0 0 ${chart.width} ${height}`} className="h-full w-full"><title>{partyLabel(party)}長條圖</title>
      <line x1={pad.left} x2={chart.width - pad.right} y1={zero} y2={zero} stroke="#ffffff22" />
      <text x={pad.left - 8} y={pad.top + 10} fill="#718897" fontSize="10" textAnchor="end">{lots(Math.round(scale))}</text>
      <text x={pad.left - 8} y={zero + 4} fill="#718897" fontSize="10" textAnchor="end">0</text>
      <text x={pad.left - 8} y={pad.top + plotHeight} fill="#718897" fontSize="10" textAnchor="end">{lots(-Math.round(scale))}</text>
      {rows.map((row, index) => {
        const x = pad.left + step * index + step / 2;
        const value = rowValue(row, party) ?? 0;
        const buying = value >= 0;
        const top = Math.min(y(value), zero);
        const barHeight = Math.max(rowValue(row, party) !== null && value !== 0 ? 2 : 0, Math.abs(y(value) - zero));
        const picked = row.ymd === selectedDate;
        return <g key={row.ymd} onMouseEnter={() => onHover(index)} onClick={() => onPick(row.ymd)} onTouchStart={() => { onHover(index); onPick(row.ymd); }} className="cursor-pointer">
          <rect x={x - step / 2} y={pad.top} width={step} height={plotHeight} fill={picked ? '#24d6a51e' : hovered === index ? '#ffffff08' : 'transparent'} />
          <rect x={x - barWidth / 2} y={top} width={barWidth} height={barHeight} rx="2" fill={buying ? '#ff6d72' : '#24d6a5'} />
          {!row.loaded && <circle cx={x} cy={zero} r="1.6" fill="#5b7183" />}
              <text x={x} y={height - 6} fill="#718897" fontSize="10" textAnchor="middle">{index % labelEvery === 0 || index === rows.length - 1 ? row.date : ''}</text>
        </g>;
      })}
    </svg>
    <div className="pointer-events-none absolute right-2 top-1 rounded-md border border-white/10 bg-[#102638]/95 px-2 py-1 font-mono text-[11px] text-[#bfd0d9]">
      <span className="mr-2 text-[#879ca9]">{day?.date ?? '—'}</span>
      {party} <strong className={hoveredValue === null ? 'text-[#8197a5]' : hoveredValue >= 0 ? 'text-[#ff8588]' : 'text-[#59e4bd]'}>{hoveredValue === null ? (day?.loaded ? '無資料' : '載入中') : `${lots(hoveredValue)} 張`}</strong>
    </div>
  </div>;
}

/** 逐日的四種法人買賣超，對應參考中的日期表；點任一列等同點該日 K 棒。 */
function FlowHistoryPanel({ stock, history, party, onParty, selectedDate, onPickDate }: {
  stock: Stock;
  history: FlowRow[];
  party: Party;
  onParty: (party: Party) => void;
  selectedDate: string;
  onPickDate: (ymd: string) => void;
}) {
  const loaded = history.filter((row) => row.loaded).length;
  const rows = [...history].reverse();
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">法人買賣超日表</h2>
        <p className="mt-1 text-xs text-[#8197a5]">單位：張 · {stock.code} {stock.name} · 每日收盤後公布 · 點任一列可切換日期</p>
        <p className="mt-1 text-[11px] text-[#7d93a1]">融資增減為當日融資餘額較前一日的變化；證交所未公布散戶買賣超，融資為市場慣用的散戶動向代理指標。</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-[#8197a5]">已載入 {loaded}/{history.length} 日</span>
        <div className="flex rounded-lg bg-white/6 p-1 text-xs">
          {parties.map((item) => <button type="button" key={item} onClick={() => onParty(item)} className={`rounded-md px-2.5 py-1.5 ${party === item ? 'bg-[#1f3848] text-white' : 'text-[#8ba0ad]'}`}>{item}</button>)}
        </div>
      </div>
    </div>
    <div className="mt-4 max-h-[420px] overflow-auto">
      <table className="w-full min-w-[660px] text-left text-sm">
        <thead className="sticky top-0 bg-[#0b1d2c] text-[11px] text-[#728998]">
          <tr className="border-b border-white/8">
            <th className="pb-3 font-medium">日期</th>
            <th className="pb-3 text-right font-medium">收盤</th>
            {parties.map((item) => <th key={item} className={`pb-3 text-right font-medium ${item === party ? 'text-[#cfdde4]' : ''}`}>{item === '融資' ? '融資增減' : item}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.ymd} onClick={() => onPickDate(row.ymd)} className={`cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[.03] ${row.ymd === selectedDate ? 'bg-white/[.05]' : ''}`}>
            <td className="py-2.5 font-mono text-[13px]">{row.date}</td>
            <td className="py-2.5 text-right font-mono text-[#afc0c9]">{row.close.toLocaleString('zh-TW')}</td>
            {parties.map((item) => {
              const value = rowValue(row, item);
              return <td key={item} className={`py-2.5 text-right font-mono ${value === null ? 'text-[#5f7484]' : value >= 0 ? 'text-[#ff8588]' : 'text-[#55e6bc]'} ${item === party ? 'font-semibold' : ''}`}>
                {value === null ? (row.loaded ? '—' : '…') : lots(value)}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

function InstitutionPanel({ stock, flow, margin, loaded, date, latest, error, onLatest }: { stock: Stock; flow: InstitutionalFlow | null; margin: MarginTrade | null; loaded: boolean; date: string; latest: boolean; error: string; onLatest: () => void }) {
  const rows = [{ title: '外資', value: flow?.foreign, icon: Building2 }, { title: '投信', value: flow?.trust, icon: Landmark }, { title: '自營商', value: flow?.dealer, icon: WalletCards }];
  const scale = Math.max(...rows.map((row) => Math.abs(row.value ?? 0)), 1);
  // 三大法人日報是收盤後才公布的日資料，所以一定要標出是哪一個交易日。
  const status = error ? error : loaded ? (flow ? '證交所三大法人日報' : '當日無買賣超資料') : '載入中…';
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">法人買賣超</h2>{date && <span className="rounded-md bg-[#24d6a5]/12 px-2 py-0.5 font-mono text-[11px] text-[#6ee5c1]">{formatDate(date)} 收盤後</span>}{!latest && <button type="button" onClick={onLatest} className="rounded-md border border-white/12 px-2 py-0.5 text-[11px] text-[#9db0ba] hover:bg-white/6">回到最新</button>}</div><p className="mt-1 text-xs text-[#8197a5]">單位：張 · {stock.code} {stock.name} · 點左側 K 棒可換日期</p></div><span className={`text-xs ${error ? 'text-[#e2b45f]' : 'text-[#64dfbb]'}`}>{status}</span></div><div className="mt-5 space-y-4">{rows.map(({ title, value, icon: Icon }) => { const buying = (value ?? 0) >= 0; return <div key={title} className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-lg ${buying ? 'bg-[#ff6d72]/10 text-[#ff8588]' : 'bg-[#24d6a5]/10 text-[#55e6bc]'}`}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex justify-between text-sm"><span>{title}</span><strong className={`font-mono ${buying ? 'text-[#ff8588]' : 'text-[#55e6bc]'}`}>{value === undefined ? '—' : lots(value)}<small className="ml-1 font-normal text-[#8197a5]">張</small></strong></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/7"><i className={`block h-full rounded-full ${buying ? 'bg-[#ff6d72]' : 'bg-[#24d6a5]'}`} style={{ width: `${Math.min(100, Math.abs(value ?? 0) / scale * 100)}%` }} /></div></div></div>; })}</div><div className="mt-6 rounded-xl border border-white/8 bg-white/[.02] p-3"><div className="flex items-center justify-between"><p className="text-xs font-medium text-[#cfdde4]">散戶動向 · 融資融券</p><span className="text-[10px] text-[#7d93a1]">代理指標</span></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><Figure label="融資餘額增減" value={margin ? `${lots(margin.change)} 張` : loaded ? '—' : '載入中'} tone={margin ? (margin.change >= 0 ? 'up' : 'down') : 'flat'} /><Figure label="融資餘額" value={margin ? `${Math.round(margin.balance).toLocaleString('zh-TW')} 張` : '—'} tone="flat" /><Figure label="融券餘額增減" value={margin ? `${lots(margin.shortChange)} 張` : loaded ? '—' : '載入中'} tone={margin ? (margin.shortChange >= 0 ? 'up' : 'down') : 'flat'} /><Figure label="券資比" value={margin && margin.balance > 0 ? `${(margin.shortBalance / margin.balance * 100).toFixed(2)}%` : '—'} tone="flat" /></div><p className="mt-3 text-[11px] leading-5 text-[#8ca1ad]">證交所未公布散戶買賣超。融資是散戶主要的槓桿工具，餘額增加通常代表散戶加碼，減少代表散戶退場或被斷頭。</p></div><div className="mt-4 rounded-xl border border-[#24d6a5]/14 bg-[#24d6a5]/5 p-3"><p className="text-xs font-medium text-[#75e8c7]">三大法人合計 {flow ? `${lots(flow.total)} 張` : '—'}</p><p className="mt-1.5 text-[11px] text-[#8ca1ad]">{date ? `資料日期 ${formatDate(date)}${latest ? '（最近交易日）' : ''}，為當日收盤後公布的日報，非盤中即時買賣超。` : '資料為收盤後公布的日報，非盤中即時買賣超。'}僅作為觀察指標，非買賣建議。</p></div></section>;
}

/**
 * 大戶／散戶籌碼要用集保結算所的股權分散表，目前尚未接入。
 * 這裡原本放的是寫死的示範數字，跟個股與日期都無關，容易被誤讀成真實籌碼，因此改為明確標示尚未接入。
 */
function OwnershipPanel() {
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Users className="size-4 text-[#d7a738]" /><h2 className="font-semibold">大戶 / 散戶籌碼</h2></div>
        <p className="mt-1 text-xs text-[#8197a5]">依持股級距觀察集保戶數與持股集中度</p>
      </div>
      <span className="rounded-full border border-[#d7a738]/20 bg-[#d7a738]/10 px-2.5 py-1 text-[10px] text-[#e7d17f]">尚未接入資料來源</span>
    </div>
    <p className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs leading-6 text-[#8197a5]">
      這張表需要集保結算所的股權分散表（每週結算一次，與法人買賣超的日資料不同步）。<br />
      資料來源接上之前先不顯示數字，以免與實際籌碼不符。
    </p>
  </section>;
}

function Watchlist({ codes, activeCode, quotes, quoteDate, onSelect, onRemove }: {
  codes: string[];
  activeCode: string;
  quotes: Record<string, DailyQuote>;
  quoteDate: string;
  onSelect: (code: string) => void;
  onRemove: (code: string, name: string) => void;
}) {
  const shown = quoteDate ? `${formatDate(quoteDate)} 收盤` : '載入中…';
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5">
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2"><h2 className="font-semibold">自選清單</h2><span className="rounded-full bg-white/8 px-2 py-0.5 font-mono text-[10px] text-[#a9bbc5]">{codes.length}</span></div>
        <p className="mt-1 text-xs text-[#8197a5]">保存在本機瀏覽器 · {shown}</p>
      </div>
      <Star className="size-4 text-[#d7a738]" />
    </div>
    {codes.length
      ? <div className="mt-4 divide-y divide-white/6">{codes.map((code) => {
        const quote = quotes[code];
        const name = quote?.name || seedName(code) || code;
        const up = (quote?.change ?? 0) >= 0;
        const percent = quote && quote.close !== quote.change ? quote.change / (quote.close - quote.change) * 100 : 0;
        return <div key={code} className={`group flex items-center gap-2 py-3 ${code === activeCode ? '-mx-2 rounded-lg bg-white/[.035] px-2' : ''}`}>
          <button onClick={() => onSelect(code)} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80">
            <span className={`size-1.5 shrink-0 rounded-full ${up ? 'bg-[#ff6d72]' : 'bg-[#24d6a5]'}`} />
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{name}</strong><small className="font-mono text-[10px] text-[#718795]">{code}</small></span>
            <span className="text-right"><strong className="block font-mono text-sm">{quote ? quote.close.toLocaleString('zh-TW') : '—'}</strong><small className={`font-mono text-[11px] ${up ? 'text-[#ff8588]' : 'text-[#55e6bc]'}`}>{quote ? `${up ? '+' : ''}${percent.toFixed(2)}%` : '—'}</small></span>
          </button>
          <button aria-label={`從自選清單移除 ${name}`} title="移出自選清單" onClick={() => onRemove(code, name)} className="rounded-md p-1 text-[#61798a] opacity-0 transition hover:bg-white/8 hover:text-[#ff8588] focus-visible:opacity-100 group-hover:opacity-100"><X className="size-3.5" /></button>
        </div>;
      })}</div>
      : <p className="mt-4 rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs leading-5 text-[#8197a5]">清單目前是空的。<br />查詢個股後，點左上角星號即可加入。</p>}
  </section>;
}

function SignalPanel() { return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="flex items-center gap-2"><Activity className="size-4 text-[#7bc0ff]" /><h2 className="font-semibold">籌碼訊號</h2></div><div className="mt-4 space-y-3"><Signal label="法人動能" value="偏多" progress="76%" color="bg-[#24d6a5]" /><Signal label="大戶集中" value="升溫" progress="69%" color="bg-[#d7a738]" /><Signal label="短線乖離" value="中性" progress="48%" color="bg-[#6ea8ff]" /></div><button className="mt-5 flex w-full items-center justify-center gap-1 text-xs text-[#67dfbc] hover:underline">設定訊號警示 <ExternalLink className="size-3" /></button></section>; }
function Figure({ label, value, tone }: { label: string; value: string; tone: 'up' | 'down' | 'flat' }) {
  const color = tone === 'up' ? 'text-[#ff8588]' : tone === 'down' ? 'text-[#55e6bc]' : 'text-[#cfdde4]';
  return <div><p className="text-[#78909e]">{label}</p><p className={`mt-0.5 font-mono font-medium ${color}`}>{value}</p></div>;
}
function Quote({ label, value }: { label: string; value: string }) { return <div className="mb-2"><p className="text-[#78909e]">{label}</p><p className="mt-0.5 font-mono font-medium text-[#ccdae1]">{value}</p></div>; }
function Signal({ label, value, progress, color }: { label: string; value: string; progress: string; color: string }) { return <div><div className="flex justify-between text-xs"><span className="text-[#9db0ba]">{label}</span><strong className="text-[#dce8ed]">{value}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7"><i className={`block h-full rounded-full ${color}`} style={{ width: progress }} /></div></div>; }
