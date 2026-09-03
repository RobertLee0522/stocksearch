'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bell, Building2, ChevronDown, ExternalLink, Landmark,
  Menu, Search, ShieldAlert, Star, TrendingDown, TrendingUp, Users,
  WalletCards,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchDailyQuotes, fetchOfficialStock, type Candle, type DailyQuote, type OfficialStock } from '@/lib/twse';

/** 每次要部署時手動遞增，方便從畫面確認線上版本是否已更新。 */
const APP_VERSION = 'v2026.09.03-1';

type Seed = {
  code: string;
  name: string;
  industry: string;
  chips: { foreign: string; trust: string; dealer: string };
};

type Stock = Seed & { price: number; change: number; volume: string; candles: Candle[] };

/** 觀察清單只保留代號、產業與籌碼示範值；價格一律取自證交所公開資料。 */
const seeds: Seed[] = [
  { code: '2330', name: '台積電', industry: '半導體業', chips: { foreign: '+4,821', trust: '+1,206', dealer: '-382' } },
  { code: '2454', name: '聯發科', industry: '半導體業', chips: { foreign: '+821', trust: '+342', dealer: '+58' } },
  { code: '2317', name: '鴻海', industry: '其他電子業', chips: { foreign: '-1,683', trust: '+204', dealer: '-96' } },
  { code: '2382', name: '廣達', industry: '電腦及週邊設備業', chips: { foreign: '+1,120', trust: '+287', dealer: '+40' } },
  { code: '2303', name: '聯電', industry: '半導體業', chips: { foreign: '+2,304', trust: '-175', dealer: '+122' } },
  { code: '0050', name: '元大台灣50', industry: 'ETF', chips: { foreign: '+3,415', trust: '—', dealer: '+84' } },
  { code: '2603', name: '長榮', industry: '航運業', chips: { foreign: '+1,042', trust: '+148', dealer: '-37' } },
  { code: '2308', name: '台達電', industry: '電子零組件業', chips: { foreign: '+912', trust: '+166', dealer: '+21' } },
  { code: '2881', name: '富邦金', industry: '金融保險業', chips: { foreign: '-628', trust: '+81', dealer: '-52' } },
  { code: '2882', name: '國泰金', industry: '金融保險業', chips: { foreign: '+704', trust: '+126', dealer: '+18' } },
  { code: '2886', name: '兆豐金', industry: '金融保險業', chips: { foreign: '+388', trust: '-44', dealer: '+33' } },
  { code: '1301', name: '台塑', industry: '塑膠工業', chips: { foreign: '-364', trust: '+25', dealer: '-19' } },
  { code: '1303', name: '南亞', industry: '塑膠工業', chips: { foreign: '+296', trust: '+41', dealer: '+15' } },
  { code: '2002', name: '中鋼', industry: '鋼鐵工業', chips: { foreign: '+1,284', trust: '-92', dealer: '+76' } },
  { code: '2412', name: '中華電', industry: '通信網路業', chips: { foreign: '+205', trust: '+74', dealer: '+11' } },
];

function toStock(official: OfficialStock): Stock {
  const seed = seeds.find((item) => item.code === official.code);
  return {
    code: official.code, name: official.name,
    industry: seed?.industry ?? '上市公司',
    chips: seed?.chips ?? { foreign: '待載入', trust: '待載入', dealer: '待載入' },
    price: official.price, change: official.change, volume: official.volume, candles: official.candles,
  };
}

export default function Home() {
  const [stock, setStock] = useState<Stock | null>(null);
  const [quotes, setQuotes] = useState<Record<string, DailyQuote>>({});
  const [quoteDate, setQuoteDate] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [notice, setNotice] = useState('正在載入證交所公開資料…');
  const isUp = (stock?.change ?? 0) >= 0;
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? seeds.filter((item) => item.code.includes(term) || item.name.toLowerCase().includes(term)) : seeds;
  }, [query]);

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
    fetchDailyQuotes()
      .then(({ date, quotes: daily }) => { setQuotes(daily); setQuoteDate(date); })
      .catch(() => setQuoteDate(''));
    void lookupOfficialStock(seeds[0].code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    await lookupOfficialStock(matches[0]?.code ?? query.trim());
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
            {['市場總覽', '個股研究', '籌碼排行', '自選清單'].map((item, index) => <button key={item} className={`rounded-lg px-3 py-2 text-sm ${index === 1 ? 'bg-white/8 text-white' : 'text-[#91a4b1] hover:text-white'}`} onClick={() => setNotice(`${item}功能會隨資料服務接入持續擴充。`)}>{item}</button>)}
          </nav>
          <form onSubmit={submitSearch} className="relative ml-auto flex w-full max-w-md items-center gap-2">
            <label className="relative block min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#76909f]" /><Input aria-label="查詢股票代號或名稱" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} placeholder="查詢代號或名稱，例如 2330" className="h-10 border-white/10 bg-white/6 pl-9 text-sm text-white placeholder:text-[#78909e]" /></label>
            <Button type="submit" disabled={lookupLoading} className="h-10 bg-[#24d6a5] px-4 text-[#06201c] hover:bg-[#5ce6bf]">{lookupLoading ? '查詢中' : '查詢'}</Button>
            {searchOpen && <div className="absolute left-0 top-11 z-50 w-[calc(100%-74px)] overflow-hidden rounded-xl border border-white/10 bg-[#102638] shadow-2xl">{matches.length ? matches.slice(0, 6).map((item) => <button type="button" key={item.code} onMouseDown={(event) => event.preventDefault()} onClick={() => void lookupOfficialStock(item.code)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/7"><span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs text-[#a9bbc5]">{item.code}</span><span className="flex-1 text-sm">{item.name}</span><span className="font-mono text-xs text-[#8fa5b2]">{quotes[item.code]?.close.toLocaleString('zh-TW') ?? '—'}</span></button>) : /^\d{4}$/.test(query.trim()) ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void lookupOfficialStock(query.trim())} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm hover:bg-white/7"><Search className="size-4 text-[#64dfbb]" /><span>查詢 <strong className="font-mono">{query.trim()}</strong> 的證交所公開資料</span></button> : <p className="px-3 py-3 text-sm text-[#93a7b3]">請輸入完整 4 位代號，或名稱關鍵字</p>}</div>}
          </form>
          <Button variant="ghost" size="icon" className="hidden text-[#a6b8c4] md:inline-flex" aria-label="通知"><Bell /></Button><Button variant="ghost" size="icon" className="text-[#a6b8c4] lg:hidden" aria-label="選單"><Menu /></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-7">
        <div role="status" className="mb-5 flex items-center gap-2 rounded-lg border border-[#d7a738]/20 bg-[#d7a738]/8 px-3 py-2 text-xs text-[#dcc979]"><ShieldAlert className="size-3.5" />{notice}</div>
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            {stock ? <>
              <StockSummary stock={stock} up={isUp} onWatch={() => setNotice(`${stock.name} 已加入本機自選清單。`)} />
              <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(370px,1fr)]">
                <KlinePanel stock={stock} />
                <InstitutionPanel stock={stock} />
              </section>
            </> : <section className="grid h-64 place-items-center rounded-2xl border border-white/8 bg-[#0b1d2c] text-sm text-[#8197a5]">正在載入證交所公開日成交資料…</section>}
            <OwnershipPanel />
          </div>
          <aside className="space-y-5">
            <Watchlist activeCode={stock?.code ?? ''} quotes={quotes} quoteDate={quoteDate} onSelect={(code) => void lookupOfficialStock(code)} />
            <SignalPanel />
            <section className="rounded-2xl border border-[#d7a738]/20 bg-gradient-to-br from-[#1e2a2b] to-[#0b1d2c] p-5"><p className="text-[10px] font-semibold tracking-[.14em] text-[#d7c479]">資料服務接入</p><h2 className="mt-2 text-base font-semibold">下一步：公開資料查詢</h2><p className="mt-2 text-xs leading-5 text-[#9cafb9]">可先接日收盤、法人買賣超與集保週資料；授權 API 則可再擴充盤中報價。</p><button className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#6ee5c1] hover:underline" onClick={() => setNotice('免費公開資料版可提供日資料與週籌碼；盤中逐筆行情需另行授權。')}>查看資料層級 <ChevronDown className="size-3 -rotate-90" /></button></section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function StockSummary({ stock, up, onWatch }: { stock: Stock; up: boolean; onWatch: () => void }) {
  const latest = stock.candles.at(-1);
  const percent = stock.change / (stock.price - stock.change) * 100;
  return <section className="grid gap-4 rounded-2xl border border-white/8 bg-[#0b1d2c] p-5 shadow-2xl shadow-black/10 md:grid-cols-[1.1fr_1fr_auto] md:items-center"><div className="flex items-start gap-3"><button aria-label="加入自選" onClick={onWatch} className="mt-1 rounded-lg p-1.5 text-[#d7a738] hover:bg-[#d7a738]/10"><Star className="size-5 fill-current" /></button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{stock.name}</h1><span className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs text-[#9db0bd]">{stock.code}</span><span className="rounded bg-[#24d6a5]/12 px-1.5 py-0.5 text-[10px] font-semibold text-[#58e5bb]">{stock.industry}</span></div><p className="mt-2 text-xs text-[#8298a7]">證交所公開日成交資料 · 非盤中即時報價{latest ? ` · ${latest.date}` : ''}</p></div></div><div><div className={`font-mono text-4xl font-semibold tracking-tight ${up ? 'text-[#ff6d72]' : 'text-[#54d9a7]'}`}>{stock.price.toLocaleString('zh-TW', { minimumFractionDigits: 1 })}</div><div className={`mt-1 flex items-center gap-2 font-mono text-sm font-medium ${up ? 'text-[#ff6d72]' : 'text-[#54d9a7]'}`}>{up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}{up ? '+' : ''}{stock.change.toFixed(1)} <span>{up ? '+' : ''}{percent.toFixed(2)}%</span></div></div><div className="grid grid-cols-2 gap-x-5 text-right text-xs lg:grid-cols-4"><Quote label="今開" value={latest?.open.toFixed(1) ?? '—'} /><Quote label="最高" value={latest?.high.toFixed(1) ?? '—'} /><Quote label="最低" value={latest?.low.toFixed(1) ?? '—'} /><Quote label="總量" value={stock.volume} /></div></section>;
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

function InstitutionPanel({ stock }: { stock: Stock }) {
  const rows = [{ title: '外資', value: stock.chips.foreign, icon: Building2 }, { title: '投信', value: stock.chips.trust, icon: Landmark }, { title: '自營商', value: stock.chips.dealer, icon: WalletCards }];
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">法人買賣超</h2><p className="mt-1 text-xs text-[#8197a5]">單位：張 · 示範資料</p></div><button className="text-xs text-[#64dfbb] hover:underline">查看明細</button></div><div className="mt-5 space-y-4">{rows.map(({ title, value, icon: Icon }) => { const up = !value.startsWith('-'); return <div key={title} className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-lg ${up ? 'bg-[#24d6a5]/10 text-[#55e6bc]' : 'bg-[#ff6d72]/10 text-[#ff8588]'}`}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex justify-between text-sm"><span>{title}</span><strong className={`font-mono ${up ? 'text-[#55e6bc]' : 'text-[#ff8588]'}`}>{value}<small className="ml-1 font-normal text-[#8197a5]">張</small></strong></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/7"><i className={`block h-full rounded-full ${up ? 'bg-[#24d6a5]' : 'bg-[#ff6d72]'}`} style={{ width: title === '外資' ? '72%' : title === '投信' ? '48%' : '30%' }} /></div></div></div>; })}</div><div className="mt-6 rounded-xl border border-[#24d6a5]/14 bg-[#24d6a5]/5 p-3"><p className="text-xs font-medium text-[#75e8c7]">三大法人資料可優先串接每日公開資料</p><p className="mt-1.5 text-[11px] text-[#8ca1ad]">僅作為觀察指標，非買賣建議。</p></div></section>;
}

function OwnershipPanel() { const rows = [['大戶 (≥400張)', '7,482', '+1,926', '69%', '偏多累積', true], ['中實戶 (100–399張)', '12,460', '+642', '56%', '偏多累積', true], ['散戶 (<100張)', '38,915', '-2,568', '44%', '偏空調節', false]]; return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="size-4 text-[#d7a738]" /><h2 className="font-semibold">大戶 / 散戶籌碼</h2></div><p className="mt-1 text-xs text-[#8197a5]">依持股級距觀察集保戶數與持股集中度</p></div><span className="rounded-full border border-[#d7a738]/20 bg-[#d7a738]/10 px-2.5 py-1 text-[10px] text-[#e7d17f]">公開資料為週資料</span></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-white/8 text-[11px] tracking-wide text-[#728998]"><tr><th className="pb-3 font-medium">投資人級距</th><th className="pb-3 text-right font-medium">持股人數</th><th className="pb-3 text-right font-medium">本週增減</th><th className="pb-3 text-right font-medium">持股集中度</th><th className="pb-3 pl-6 font-medium">籌碼傾向</th></tr></thead><tbody>{rows.map(([label, people, change, concentration, signal, up]) => <tr key={String(label)} className="border-b border-white/5 last:border-0"><td className="py-4 font-medium">{label}</td><td className="py-4 text-right font-mono text-[#afc0c9]">{people}</td><td className={`py-4 text-right font-mono ${up ? 'text-[#55e6bc]' : 'text-[#ff8588]'}`}>{change}</td><td className="py-4 text-right"><span className="font-mono">{concentration}</span><span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-white/7 align-middle"><i className={`block h-full rounded-full ${up ? 'bg-[#24d6a5]' : 'bg-[#ff6d72]'}`} style={{ width: String(concentration) }} /></span></td><td className="py-4 pl-6"><span className={`rounded-md px-2 py-1 text-xs ${up ? 'bg-[#24d6a5]/10 text-[#5ce6bf]' : 'bg-[#ff6d72]/10 text-[#ff989a]'}`}>{signal}</span></td></tr>)}</tbody></table></div></section>; }

function Watchlist({ activeCode, quotes, quoteDate, onSelect }: { activeCode: string; quotes: Record<string, DailyQuote>; quoteDate: string; onSelect: (code: string) => void }) {
  const shown = quoteDate ? `${quoteDate.slice(0, 4)}/${quoteDate.slice(4, 6)}/${quoteDate.slice(6)} 收盤` : '載入中…';
  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">快速查詢</h2><p className="mt-1 text-xs text-[#8197a5]">點選查詢個股 · {shown}</p></div><ChevronDown className="size-4 text-[#afc0ca]" /></div><div className="mt-4 divide-y divide-white/6">{seeds.map((seed) => {
    const quote = quotes[seed.code];
    const up = (quote?.change ?? 0) >= 0;
    const percent = quote && quote.close !== quote.change ? quote.change / (quote.close - quote.change) * 100 : 0;
    return <button key={seed.code} onClick={() => onSelect(seed.code)} className={`flex w-full items-center gap-2 py-3 text-left hover:bg-white/[.025] ${seed.code === activeCode ? 'rounded-lg bg-white/[.035] px-2 -mx-2' : ''}`}><span className={`size-1.5 rounded-full ${up ? 'bg-[#24d6a5]' : 'bg-[#ff6d72]'}`} /><span className="min-w-0 flex-1"><strong className="block text-sm font-medium">{quote?.name || seed.name}</strong><small className="font-mono text-[10px] text-[#718795]">{seed.code}</small></span><span className="text-right"><strong className="block font-mono text-sm">{quote ? quote.close.toLocaleString('zh-TW') : '—'}</strong><small className={`font-mono text-[11px] ${up ? 'text-[#55e6bc]' : 'text-[#ff8588]'}`}>{quote ? `${up ? '+' : ''}${percent.toFixed(2)}%` : '—'}</small></span></button>;
  })}</div></section>;
}

function SignalPanel() { return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5"><div className="flex items-center gap-2"><Activity className="size-4 text-[#7bc0ff]" /><h2 className="font-semibold">籌碼訊號</h2></div><div className="mt-4 space-y-3"><Signal label="法人動能" value="偏多" progress="76%" color="bg-[#24d6a5]" /><Signal label="大戶集中" value="升溫" progress="69%" color="bg-[#d7a738]" /><Signal label="短線乖離" value="中性" progress="48%" color="bg-[#6ea8ff]" /></div><button className="mt-5 flex w-full items-center justify-center gap-1 text-xs text-[#67dfbc] hover:underline">設定訊號警示 <ExternalLink className="size-3" /></button></section>; }
function Quote({ label, value }: { label: string; value: string }) { return <div className="mb-2"><p className="text-[#78909e]">{label}</p><p className="mt-0.5 font-mono font-medium text-[#ccdae1]">{value}</p></div>; }
function Signal({ label, value, progress, color }: { label: string; value: string; progress: string; color: string }) { return <div><div className="flex justify-between text-xs"><span className="text-[#9db0ba]">{label}</span><strong className="text-[#dce8ed]">{value}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7"><i className={`block h-full rounded-full ${color}`} style={{ width: progress }} /></div></div>; }
