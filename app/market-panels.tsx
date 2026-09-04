'use client';

import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

import type { DailyQuote, InstitutionalFlow, MarketSnapshot } from '@/lib/twse';

/** 買賣超一律標出正負號，單位為張。 */
export const lots = (value: number) => `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('zh-TW')}`;

export const billions = (value: number) => `${(value / 100_000_000).toLocaleString('zh-TW', { maximumFractionDigits: 0 })} 億`;

export const formatDate = (ymd: string) => (ymd ? `${ymd.slice(0, 4)}/${ymd.slice(4, 6)}/${ymd.slice(6)}` : '');

const up = 'text-[#ff8588]';
const down = 'text-[#55e6bc]';
const tone = (value: number) => (value >= 0 ? up : down);

function Loading({ label }: { label: string }) {
  return <section className="grid h-64 place-items-center rounded-2xl border border-white/8 bg-[#0b1d2c] text-sm text-[#8197a5]">{label}</section>;
}

export function MarketOverview({ snapshot, onSelect }: { snapshot: MarketSnapshot | null; onSelect: (code: string) => void }) {
  if (!snapshot) return <Loading label="正在載入大盤資料…" />;
  const weighted = snapshot.indices.find((item) => item.name.includes('發行量加權股價指數'));
  const others = snapshot.indices.filter((item) => item.name !== weighted?.name).slice(0, 6);
  const { breadth, turnover } = snapshot;
  const counted = breadth ? Math.max(1, breadth.up + breadth.down + breadth.flat) : 1;
  const actives = Object.values(snapshot.quotes)
    .filter((quote) => /^\d{4}$/.test(quote.code))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return <div className="space-y-5">
    <section className="grid gap-5 rounded-2xl border border-white/8 bg-[#0b1d2c] p-5 md:grid-cols-[1.1fr_1fr_1.2fr]">
      <div>
        <p className="text-xs text-[#8197a5]">發行量加權股價指數 · {formatDate(snapshot.date)} 收盤</p>
        <div className={`mt-1 font-mono text-4xl font-semibold tracking-tight ${tone(weighted?.change ?? 0)}`}>
          {weighted ? weighted.close.toLocaleString('zh-TW', { minimumFractionDigits: 2 }) : '—'}
        </div>
        {weighted && <div className={`mt-1 flex items-center gap-2 font-mono text-sm ${tone(weighted.change)}`}>
          {weighted.change >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          {weighted.change >= 0 ? '+' : ''}{weighted.change.toFixed(2)}
          <span>{weighted.percent >= 0 ? '+' : ''}{weighted.percent.toFixed(2)}%</span>
        </div>}
      </div>
      <div>
        <p className="text-xs text-[#8197a5]">成交統計（證券合計）</p>
        <p className="mt-1 font-mono text-2xl">{turnover ? billions(turnover.amount) : '—'}</p>
        <p className="mt-1 font-mono text-xs text-[#9db0ba]">{turnover ? `${Math.round(turnover.shares / 1000).toLocaleString('zh-TW')} 張` : '—'}</p>
        <p className="font-mono text-xs text-[#9db0ba]">{turnover ? `${turnover.trades.toLocaleString('zh-TW')} 筆` : '—'}</p>
      </div>
      <div>
        <p className="text-xs text-[#8197a5]">股票漲跌家數</p>
        {breadth ? <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/7">
            <i className="block h-full bg-[#ff6d72]" style={{ width: `${breadth.up / counted * 100}%` }} />
            <i className="block h-full bg-[#8197a5]" style={{ width: `${breadth.flat / counted * 100}%` }} />
            <i className="block h-full bg-[#24d6a5]" style={{ width: `${breadth.down / counted * 100}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-[#8197a5]">
            <div><p className={`font-mono text-lg ${up}`}>{breadth.up}</p>上漲 · {breadth.upLimit} 漲停</div>
            <div><p className="font-mono text-lg text-[#c3d2da]">{breadth.flat}</p>持平</div>
            <div><p className={`font-mono text-lg ${down}`}>{breadth.down}</p>下跌 · {breadth.downLimit} 跌停</div>
          </div>
        </> : <p className="mt-2 text-sm text-[#8197a5]">—</p>}
      </div>
    </section>

    <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5">
      <h2 className="font-semibold">其他指數</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {others.map((index) => <div key={index.name} className="rounded-xl border border-white/6 bg-white/[.02] p-3">
          <p className="truncate text-xs text-[#9db0ba]">{index.name}</p>
          <p className="mt-1 font-mono text-lg">{index.close.toLocaleString('zh-TW', { minimumFractionDigits: 2 })}</p>
          <p className={`font-mono text-xs ${tone(index.percent)}`}>{index.percent >= 0 ? '+' : ''}{index.percent.toFixed(2)}%</p>
        </div>)}
      </div>
    </section>

    <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5">
      <h2 className="font-semibold">成交金額前 10 名</h2>
      <p className="mt-1 text-xs text-[#8197a5]">點選任一列可切換到個股研究</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-white/8 text-[11px] text-[#728998]">
            <tr><th className="pb-3 font-medium">個股</th><th className="pb-3 text-right font-medium">收盤</th><th className="pb-3 text-right font-medium">漲跌</th><th className="pb-3 text-right font-medium">成交金額</th><th className="pb-3 text-right font-medium">成交量</th></tr>
          </thead>
          <tbody>
            {actives.map((quote) => <tr key={quote.code} onClick={() => onSelect(quote.code)} className="cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[.03]">
              <td className="py-3"><strong className="font-medium">{quote.name}</strong><small className="ml-2 font-mono text-[10px] text-[#718795]">{quote.code}</small></td>
              <td className="py-3 text-right font-mono">{quote.close.toLocaleString('zh-TW')}</td>
              <td className={`py-3 text-right font-mono ${tone(quote.change)}`}>{quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)}</td>
              <td className="py-3 text-right font-mono text-[#afc0c9]">{billions(quote.amount)}</td>
              <td className="py-3 text-right font-mono text-[#afc0c9]">{Math.round(quote.shares / 1000).toLocaleString('zh-TW')} 張</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

const sides = ['買超', '賣超'] as const;
const parties = ['三大法人', '外資', '投信', '自營商'] as const;

export function FlowRanking({ flows, quotes, quoteDate, error, onSelect }: {
  flows: InstitutionalFlow[] | null;
  quotes: Record<string, DailyQuote>;
  quoteDate: string;
  error: string;
  onSelect: (code: string) => void;
}) {
  const [side, setSide] = useState<typeof sides[number]>('買超');
  const [party, setParty] = useState<typeof parties[number]>('三大法人');
  const ranked = useMemo(() => {
    if (!flows) return [];
    const pick = (flow: InstitutionalFlow) =>
      party === '外資' ? flow.foreign : party === '投信' ? flow.trust : party === '自營商' ? flow.dealer : flow.total;
    return [...flows]
      .filter((flow) => (side === '買超' ? pick(flow) > 0 : pick(flow) < 0))
      .sort((a, b) => (side === '買超' ? pick(b) - pick(a) : pick(a) - pick(b)))
      .slice(0, 20);
  }, [flows, side, party]);

  if (!flows) return <Loading label={error || '正在載入三大法人買賣超日報…'} />;

  return <section className="rounded-2xl border border-white/8 bg-[#0b1d2c] p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold">三大法人買賣超排行</h2>
        <p className="mt-1 text-xs text-[#8197a5]">單位：張 · 僅上市個股 · {formatDate(quoteDate)} 收盤後公布</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-lg bg-white/6 p-1 text-xs">
          {sides.map((item) => <button type="button" key={item} onClick={() => setSide(item)} className={`rounded-md px-2.5 py-1.5 ${side === item ? 'bg-[#1f3848] text-white' : 'text-[#8ba0ad]'}`}>{item}</button>)}
        </div>
        <div className="flex rounded-lg bg-white/6 p-1 text-xs">
          {parties.map((item) => <button type="button" key={item} onClick={() => setParty(item)} className={`rounded-md px-2.5 py-1.5 ${party === item ? 'bg-[#1f3848] text-white' : 'text-[#8ba0ad]'}`}>{item}</button>)}
        </div>
      </div>
    </div>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[660px] text-left text-sm">
        <thead className="border-b border-white/8 text-[11px] text-[#728998]">
          <tr><th className="pb-3 font-medium">個股</th><th className="pb-3 text-right font-medium">收盤</th><th className="pb-3 text-right font-medium">漲跌%</th><th className="pb-3 text-right font-medium">外資</th><th className="pb-3 text-right font-medium">投信</th><th className="pb-3 text-right font-medium">自營商</th><th className="pb-3 text-right font-medium">合計</th></tr>
        </thead>
        <tbody>
          {ranked.map((flow) => {
            const quote = quotes[flow.code];
            const percent = quote && quote.close !== quote.change ? quote.change / (quote.close - quote.change) * 100 : 0;
            return <tr key={flow.code} onClick={() => onSelect(flow.code)} className="cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[.03]">
              <td className="py-3"><strong className="font-medium">{flow.name}</strong><small className="ml-2 font-mono text-[10px] text-[#718795]">{flow.code}</small></td>
              <td className="py-3 text-right font-mono">{quote ? quote.close.toLocaleString('zh-TW') : '—'}</td>
              <td className={`py-3 text-right font-mono ${tone(percent)}`}>{quote ? `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%` : '—'}</td>
              <td className={`py-3 text-right font-mono ${tone(flow.foreign)}`}>{lots(flow.foreign)}</td>
              <td className={`py-3 text-right font-mono ${tone(flow.trust)}`}>{lots(flow.trust)}</td>
              <td className={`py-3 text-right font-mono ${tone(flow.dealer)}`}>{lots(flow.dealer)}</td>
              <td className={`py-3 text-right font-mono ${tone(flow.total)}`}>{lots(flow.total)}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {!ranked.length && <p className="mt-4 text-sm text-[#8197a5]">當日沒有符合條件的資料。</p>}
  </section>;
}
