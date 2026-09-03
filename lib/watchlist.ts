/** 自選清單只存在使用者瀏覽器，靜態網站沒有後端可以保存個人設定。 */
const STORAGE_KEY = 'chip-radar.watchlist.v1';

const isCode = (value: unknown): value is string => typeof value === 'string' && /^\d{4}$/.test(value);

/**
 * 讀取本機自選清單；沒有存過任何清單時回傳預設清單。
 * 使用者把清單清空後會存下空陣列，這時要保留空清單而不是還原預設值。
 */
export function readWatchlist(fallback: string[]): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return [...new Set(parsed.filter(isCode))];
  } catch {
    // 無痕模式或使用者停用儲存空間時直接沿用預設清單。
    return fallback;
  }
}

export function writeWatchlist(codes: string[]) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    // 寫入失敗只影響下次開啟時的還原，畫面維持目前狀態即可。
  }
}

export type StockOption = { code: string; name: string };

/** 代號完全相同 > 代號開頭相符 > 名稱開頭相符 > 其他，同組再依代號排序。 */
function matchRank(option: StockOption, term: string) {
  if (option.code === term) return 0;
  if (option.code.startsWith(term)) return 1;
  if (option.name.toLowerCase().startsWith(term)) return 2;
  return 3;
}

/** 從全市場清單找出符合代號或名稱的個股。 */
export function searchStocks(universe: StockOption[], query: string, limit = 8): StockOption[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return universe
    .filter((option) => option.code.includes(term) || option.name.toLowerCase().includes(term))
    .sort((a, b) => matchRank(a, term) - matchRank(b, term) || a.code.localeCompare(b.code))
    .slice(0, limit);
}
