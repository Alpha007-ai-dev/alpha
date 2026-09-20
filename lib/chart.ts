export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type ChartTf = '1H' | '6H' | '24H';
export type ChartResult = {
  mint: string;
  tf: ChartTf;
  status: 'OK' | 'NO_POOL' | 'RATE_LIMIT' | 'ERROR';
  candles: Candle[];
  pool?: string;
  dex?: string;
};

const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
const TF: Record<ChartTf, { unit: string; agg: number; limit: number }> = {
  '1H': { unit: 'minute', agg: 1, limit: 60 },
  '6H': { unit: 'minute', agg: 5, limit: 72 },
  '24H': { unit: 'minute', agg: 15, limit: 96 },
};

const poolCache: Record<string, { pool: string | null; dex?: string; at: number }> = {};
const candleCache: Record<string, { res: ChartResult; at: number }> = {};
const POOL_TTL = 10 * 60 * 1000;
const NO_POOL_TTL = 2 * 60 * 1000;
const CANDLE_TTL = 60 * 1000;

export async function getPool(mint: string): Promise<{ pool: string | null; dex?: string; status: ChartResult['status'] }> {
  const c = poolCache[mint];
  if (c && Date.now() - c.at < (c.pool ? POOL_TTL : NO_POOL_TTL)) {
    return { pool: c.pool, dex: c.dex, status: c.pool ? 'OK' : 'NO_POOL' };
  }
  const r = await fetch(GT + '/tokens/' + mint + '/pools');
  if (r.status === 429) return { pool: null, status: 'RATE_LIMIT' };
  if (r.status === 404) {
    poolCache[mint] = { pool: null, at: Date.now() };
    return { pool: null, status: 'NO_POOL' };
  }
  if (!r.ok) return { pool: null, status: 'ERROR' };
  const j = await r.json();
  const list: any[] = Array.isArray(j?.data) ? j.data : [];
  let best: any = null;
  for (const p of list) {
    const liq = Number(p?.attributes?.reserve_in_usd ?? 0);
    if (!best || liq > Number(best?.attributes?.reserve_in_usd ?? 0)) best = p;
  }
  const pool = best?.attributes?.address ?? null;
  const dex = best?.relationships?.dex?.data?.id;
  poolCache[mint] = { pool, dex, at: Date.now() };
  return { pool, dex, status: pool ? 'OK' : 'NO_POOL' };
}

export async function fetchCandles(mint: string, tf: ChartTf): Promise<ChartResult> {
  const key = mint + '|' + tf;
  const cc = candleCache[key];
  if (cc && Date.now() - cc.at < CANDLE_TTL) return cc.res;
  try {
    const p = await getPool(mint);
    if (!p.pool) return { mint, tf, status: p.status === 'OK' ? 'NO_POOL' : p.status, candles: [] };
    const cfg = TF[tf];
    const r = await fetch(GT + '/pools/' + p.pool + '/ohlcv/' + cfg.unit + '?aggregate=' + cfg.agg + '&limit=' + cfg.limit + '&token=' + mint);
    if (r.status === 429) return { mint, tf, status: 'RATE_LIMIT', candles: [] };
    if (!r.ok) return { mint, tf, status: 'ERROR', candles: [] };
    const j = await r.json();
    const raw: any[] = j?.data?.attributes?.ohlcv_list ?? [];
    const candles: Candle[] = raw
      .map(a => ({ t: Number(a[0]), o: Number(a[1]), h: Number(a[2]), l: Number(a[3]), c: Number(a[4]), v: Number(a[5]) }))
      .filter(k => isFinite(k.o) && isFinite(k.h) && isFinite(k.l) && isFinite(k.c) && k.h > 0)
      .sort((a, b) => a.t - b.t);
    const res: ChartResult = { mint, tf, status: candles.length ? 'OK' : 'NO_POOL', candles, pool: p.pool, dex: p.dex };
    candleCache[key] = { res, at: Date.now() };
    return res;
  } catch {
    return { mint, tf, status: 'ERROR', candles: [] };
  }
}