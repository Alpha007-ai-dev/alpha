import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'alpha_demo_positions_v1';

export type DemoPos = {
  id: string;
  mint: string;
  symbol?: string;
  usd: number;
  entryPrice: number;
  qty: number;
  t: number;
  flowLabel?: string;
  closed?: { t: number; price: number; usd: number };
};

async function readAll(): Promise<DemoPos[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: DemoPos[]) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(-300))); } catch {}
}

export async function openDemo(mint: string, symbol: string | undefined, usd: number, price: number, flowLabel?: string): Promise<boolean> {
  if (!price || price <= 0 || !usd || usd <= 0) return false;
  const list = await readAll();
  list.push({ id: mint + '_' + Date.now(), mint, symbol, usd, entryPrice: price, qty: usd / price, t: Date.now(), flowLabel });
  await writeAll(list);
  return true;
}

export async function closeDemo(id: string, price: number) {
  const list = await readAll();
  const p = list.find(x => x.id === id);
  if (!p || p.closed || !price) return;
  p.closed = { t: Date.now(), price, usd: p.qty * price };
  await writeAll(list);
}

export async function listDemo(): Promise<DemoPos[]> {
  const list = await readAll();
  return list.sort((a, b) => b.t - a.t);
}

export async function livePrices(mints: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const uniq = Array.from(new Set(mints)).slice(0, 20);
  for (const m of uniq) {
    try {
      const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + m);
      if (!r.ok) continue;
      const arr = await r.json();
      const tok = (Array.isArray(arr) ? arr : arr?.tokens ?? []).find((t: any) => (t.id ?? t.address) === m);
      const p = Number(tok?.usdPrice ?? NaN);
      if (isFinite(p) && p > 0) out[m] = p;
    } catch {}
  }
  return out;
}