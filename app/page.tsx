'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bell, Building2, ChevronDown, ExternalLink, Landmark,
  Menu, Search, ShieldAlert, Star, TrendingDown, TrendingUp, Users,
  WalletCards, X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FlowRanking, formatDate, lots, MarketOverview } from '@/app/market-panels';
import {
  fetchInstitutionalFlows, fetchMarketSnapshot, fetchOfficialStock,
  type Candle, type DailyQuote, type InstitutionalFlow, type MarketSnapshot, type OfficialStock,
} from '@/lib/twse';
import { readWatchlist, searchStocks, type StockOption, writeWatchlist } from '@/lib/watchlist';

/** 每次要部署時手動遞增，方便從畫面確認線上版本是否已更新。 */
const APP_VERSION = 'v2026.09.03-3';

type Seed = {
  code: string;
  name: string;
  industry: string;
};

type Stock = Seed & { price: number; change: number; volume: string; candles: Candle[] };

const views = ['市場總覽', '個股研究', '籌碼排行'] as const;

type View = typeof views[number];

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
  const [flows, setFlows] = useState<InstitutionalFlow[] | null>(null);
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
      .then((market) => {
        setSnapshot(market);
        // 三大法人日報約 300KB，等大盤資料到齊後再背景載入，避免拖慢首次顯示。
        return fetchInstitutionalFlows(market.date).then(setFlows);
      })
      .catch(() => undefined);
    void lookupOfficialStock(seeds[0].code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            {view === '市場總覽' ? <MarketOverview snapshot={snapshot} onSelect={openStock} />
              : view === '籌碼排行' ? <FlowRanking flows={flows} quotes={quotes} quoteDate={quoteDate} onSelect={openStock} />
              : <>
                {stock ? <>
                  <StockSummary stock={stock} up={isUp} watched={watched} onWatch={() => toggleWatch(stock.code, stock.name)} />
                  <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(370px,1fr)]">
                    <KlinePanel stock={stock} />
                    <InstitutionPanel stock={stock} flow={flows?.find((item) => item.code === stock.code) ?? null} loaded={flows !== null} />
                  </section>
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

function KlinePanel({ stock }: { stock: Stock }) {
  const [range, setRange] = useState('20日');
  const fullData = stock.candles;
  const count = range === '5日' ? 5 : range === '20日' ? 20 : 60;
  const data = fullData.slice(-count);
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">日 K 線</h2><p className="mt-1 text-xs text-[#8197a5]">開、高、低、收 · {stock.code} {stock.name} · 顯示 {data.length} 根</p></div><div className="flex rounded-lg bg-white/6 p-1 text-xs">{['5日', '20日', '60日'].map((item) => <button type="button" key={item} onClick={() => setRange(item)} className={`rounded-md px-2.5 py-1.5 ${range === item ? 'bg-[#1f3848] text-white' : 'text-[#8ba0ad]'}`}>{item}</button>)}</div></div><CandlestickChart data={data} /><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#8197a5]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-[#ff6d72]" />收漲 K</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 bg-[#24d6a5]" />收跌 K</span><span className="ml-auto">證交所公開日成交資料</span></div></section>;
}

function CandlestickChart({ data }: { data: Candle[] }) {
  const [hovered, setHovered] = useState(data.length - 1);
  useEffect(() => setHovered(data.length - 1), [data]);
  const width = 760; const height = 310; const pad = { left: 48, right: 12, top: 16, bottom: 38 };
  const max = Math.max(...data.map((item) => item.high)); const min = Math.min(...data.map((item) => item.low)); const buffer = (max - min) * 0.14 || 1;
  const ceiling = max + buffer; const floor = min - buffer; const plotHeight = height - pad.top - pad.bottom; const plotWidth = width - pad.left - pad.right;
  const y = (value: number) => pad.top + (ceiling - value) / (ceiling - floor) * plotHeight;
  const step = plotWidth / data.length; const candleWidth = Math.min(28, Math.max(3, step * 0.58)); const selected = data[hovered] ?? data[data.length - 1];
  const ticks = [ceiling, (ceiling * 2 + floor) / 3, (ceiling + floor * 2) / 3, floor];
  return <div className="relative h-[310px] w-full overflow-hidden"><svg role="img" aria-label="日 K 線圖" viewBox={`0 0 ${width} ${height}`} className="h-full w-full"><rect width={width} height={height} fill="transparent" />{ticks.map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#ffffff12" /><text x={pad.left - 8} y={y(tick) + 4} fill="#718897" fontSize="11" textAnchor="end">{tick.toFixed(1)}</text></g>)}{data.map((item, index) => { const x = pad.left + step * index + step / 2; const rise = item.close >= item.open; const color = rise ? '#ff6d72' : '#24d6a5'; const bodyTop = y(Math.max(item.open, item.close)); const bodyHeight = Math.max(2, Math.abs(y(item.open) - y(item.close))); return <g key={item.date} onMouseEnter={() => setHovered(index)} onClick={() => setHovered(index)} onTouchStart={() => setHovered(index)} className="cursor-crosshair"><rect x={x - step / 2} y={pad.top} width={step} height={plotHeight} fill={hovered === index ? '#ffffff08' : 'transparent'} /><line x1={x} x2={x} y1={y(item.high)} y2={y(item.low)} stroke={color} strokeWidth="1.5" /><rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} rx="1" /><text x={x} y={height - 16} fill="#718897" fontSize="10" textAnchor="middle">{index % Math.ceil(data.length / 6) === 0 || index === data.length - 1 ? item.date : ''}</text></g>; })}</svg><div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-white/10 bg-[#102638]/95 px-3 py-2 font-mono text-[11px] text-[#bfd0d9] shadow-lg"><span className="mr-3 text-[#879ca9]">{selected.date}</span>開 {selected.open.toFixed(1)}　高 {selected.high.toFixed(1)}　低 {selected.low.toFixed(1)}　收 <strong className={selected.close >= selected.open ? 'text-[#ff8588]' : 'text-[#59e4bd]'}>{selected.close.toFixed(1)}</strong></div></div>;
}

function InstitutionPanel({ stock, flow, loaded }: { stock: Stock; flow: InstitutionalFlow | null; loaded: boolean }) {
  const rows = [{ title: '外資', value: flow?.foreign, icon: Building2 }, { title: '投信', value: flow?.trust, icon: Landmark }, { title: '自營商', value: flow?.dealer, icon: WalletCards }];
  const scale = Math.max(...rows.map((row) => Math.abs(row.value ?? 0)), 1);
  const status = loaded ? (flow ? '證交所三大法人日報' : '當日無買賣超資料') : '載入中…';
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">法人買賣超</h2><p className="mt-1 text-xs text-[#8197a5]">單位：張 · {stock.code} {stock.name}</p></div><span className="text-xs text-[#64dfbb]">{status}</span></div><div className="mt-5 space-y-4">{rows.map(({ title, value, icon: Icon }) => { const buying = (value ?? 0) >= 0; return <div key={title} className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-lg ${buying ? 'bg-[#ff6d72]/10 text-[#ff8588]' : 'bg-[#24d6a5]/10 text-[#55e6bc]'}`}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex justify-between text-sm"><span>{title}</span><strong className={`font-mono ${buying ? 'text-[#ff8588]' : 'text-[#55e6bc]'}`}>{value === undefined ? '—' : lots(value)}<small className="ml-1 font-normal text-[#8197a5]">張</small></strong></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/7"><i className={`block h-full rounded-full ${buying ? 'bg-[#ff6d72]' : 'bg-[#24d6a5]'}`} style={{ width: `${Math.min(100, Math.abs(value ?? 0) / scale * 100)}%` }} /></div></div></div>; })}</div><div className="mt-6 rounded-xl border border-[#24d6a5]/14 bg-[#24d6a5]/5 p-3"><p className="text-xs font-medium text-[#75e8c7]">三大法人合計 {flow ? `${lots(flow.total)} 張` : '—'}</p><p className="mt-1.5 text-[11px] text-[#8ca1ad]">僅作為觀察指標，非買賣建議。</p></div></section>;
}

function OwnershipPanel() { const rows = [['大戶 (≥400張)', '7,482', '+1,926', '69%', '偏多累積', true], ['中實戶 (100–399張)', '12,460', '+642', '56%', '偏多累積', true], ['散戶 (<100張)', '38,915', '-2,568', '44%', '偏空調節', false]]; return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="size-4 text-[#d7a738]" /><h2 className="font-semibold">大戶 / 散戶籌碼</h2></div><p className="mt-1 text-xs text-[#8197a5]">依持股級距觀察集保戶數與持股集中度</p></div><span className="rounded-full border border-[#d7a738]/20 bg-[#d7a738]/10 px-2.5 py-1 text-[10px] text-[#e7d17f]">公開資料為週資料</span></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-white/8 text-[11px] tracking-wide text-[#728998]"><tr><th className="pb-3 font-medium">投資人級距</th><th className="pb-3 text-right font-medium">持股人數</th><th className="pb-3 text-right font-medium">本週增減</th><th className="pb-3 text-right font-medium">持股集中度</th><th className="pb-3 pl-6 font-medium">籌碼傾向</th></tr></thead><tbody>{rows.map(([label, people, change, concentration, signal, up]) => <tr key={String(label)} className="border-b border-white/5 last:border-0"><td className="py-4 font-medium">{label}</td><td className="py-4 text-right font-mono text-[#afc0c9]">{people}</td><td className={`py-4 text-right font-mono ${up ? 'text-[#55e6bc]' : 'text-[#ff8588]'}`}>{change}</td><td className="py-4 text-right"><span className="font-mono">{concentration}</span><span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-white/7 align-middle"><i className={`block h-full rounded-full ${up ? 'bg-[#24d6a5]' : 'bg-[#ff6d72]'}`} style={{ width: String(concentration) }} /></span></td><td className="py-4 pl-6"><span className={`rounded-md px-2 py-1 text-xs ${up ? 'bg-[#24d6a5]/10 text-[#5ce6bf]' : 'bg-[#ff6d72]/10 text-[#ff989a]'}`}>{signal}</span></td></tr>)}</tbody></table></div></section>; }

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
function Quote({ label, value }: { label: string; value: string }) { return <div className="mb-2"><p className="text-[#78909e]">{label}</p><p className="mt-0.5 font-mono font-medium text-[#ccdae1]">{value}</p></div>; }
function Signal({ label, value, progress, color }: { label: string; value: string; progress: string; color: string }) { return <div><div className="flex justify-between text-xs"><span className="text-[#9db0ba]">{label}</span><strong className="text-[#dce8ed]">{value}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7"><i className={`block h-full rounded-full ${color}`} style={{ width: progress }} /></div></div>; }
