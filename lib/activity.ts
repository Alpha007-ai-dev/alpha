export type ActLevel = 'CALM' | 'NOTABLE' | 'SHARP' | 'UNKNOWN';

export type Metric = {
  key: string;
  label: string;
  level: ActLevel;
  value: string;
  fact: string;
  reading: string;
};

export type Snapshot = {
  price?: number;
  mcap?: number;
  fdv?: number;
  liquidity?: number;
  holders?: number;
  ageDays?: number;
};

export type Row = { label: string; m5: string; h1: string; h6: string; h24: string };

export type Para = { title: string; facts: string[]; text: string };

export type Activity = {
  mint: string;
  symbol?: string;
  name?: string;
  decimals: number;
  snapshot: Snapshot;
  rows: Row[];
  metrics: Metric[];
  explanation: Para[];
  knownCount: number;
  totalCount: number;
};

export const LIQ_DROP_SHARP = -20;
export const LIQ_DROP_NOTABLE = -8;
export const REVERSAL_SHARP = -25;
export const REVERSAL_NOTABLE = -10;
export const STRONG_24H = 100;
export const ORGANIC_SHARP = 3;
export const ORGANIC_NOTABLE = 8;
export const SELL_RATIO_SHARP = 1.25;
export const SELL_RATIO_NOTABLE = 1.08;

const pct = (n: any) => {
  const v = Number(n);
  return isNaN(v) ? '--' : (v >= 0 ? '+' : '') + (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1)) + '%';
};

const money = (n: any) => {
  const v = Number(n);
  if (isNaN(v) || v <= 0) return '--';
  return v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B'
    : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M'
    : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K'
    : '$' + v.toFixed(2);
};

const num = (n: any) => {
  const v = Number(n);
  return isNaN(v) ? '--' : Math.round(v).toLocaleString();
};

export async function getActivity(mint: string): Promise<Activity | null> {
  let tok: any = null;
  try {
    const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + mint);
    const arr = await r.json();
    tok = (Array.isArray(arr) ? arr : arr?.tokens ?? []).find((t: any) => (t.id ?? t.address) === mint);
  } catch {}
  if (!tok) return null;

  const m5 = tok.stats5m ?? {};
  const h1 = tok.stats1h ?? {};
  const h6 = tok.stats6h ?? {};
  const h24 = tok.stats24h ?? {};

  const first = tok.firstPool?.createdAt ?? tok.createdAt;
  const ageDays = first ? Math.floor((Date.now() - new Date(first).getTime()) / 86400000) : undefined;

  const snapshot: Snapshot = {
    price: Number(tok.usdPrice ?? NaN),
    mcap: Number(tok.mcap ?? NaN),
    fdv: Number(tok.fdv ?? NaN),
    liquidity: Number(tok.liquidity ?? NaN),
    holders: Number(tok.holderCount ?? NaN),
    ageDays,
  };

  const vol = (w: any) => {
    const b = Number(w.buyVolume ?? 0) + Number(w.sellVolume ?? 0);
    return b > 0 ? money(b) : '--';
  };
  const bs = (w: any) =>
    w.numBuys !== undefined ? num(w.numBuys) + ' / ' + num(w.numSells) : '--';

  const rows: Row[] = [
    { label: 'Price', m5: pct(m5.priceChange), h1: pct(h1.priceChange), h6: pct(h6.priceChange), h24: pct(h24.priceChange) },
    { label: 'Liquidity', m5: pct(m5.liquidityChange), h1: pct(h1.liquidityChange), h6: pct(h6.liquidityChange), h24: pct(h24.liquidityChange) },
    { label: 'Holders', m5: pct(m5.holderChange), h1: pct(h1.holderChange), h6: pct(h6.holderChange), h24: pct(h24.holderChange) },
    { label: 'Volume', m5: vol(m5), h1: vol(h1), h6: vol(h6), h24: vol(h24) },
    { label: 'Buys/Sells', m5: bs(m5), h1: bs(h1), h6: bs(h6), h24: bs(h24) },
  ];

  const metrics: Metric[] = [];

  const lq = Number(h1.liquidityChange ?? NaN);
  metrics.push({
    key: 'liquidity_trend',
    label: 'Liquidity',
    level: isNaN(lq) ? 'UNKNOWN' : lq <= LIQ_DROP_SHARP ? 'SHARP' : lq <= LIQ_DROP_NOTABLE ? 'NOTABLE' : 'CALM',
    value: isNaN(lq) ? 'unknown' : pct(lq) + ' / 1h',
    fact: isNaN(lq) ? 'No 1h liquidity data.' : 'Pool liquidity changed ' + pct(lq) + ' in the last hour.',
    reading: isNaN(lq) ? '' : lq < 0 ? 'Liquidity is leaving the pool.' : 'Liquidity is stable or growing.',
  });

  const p1 = Number(h1.priceChange ?? NaN);
  const p24 = Number(h24.priceChange ?? NaN);
  const strongRun = !isNaN(p24) && p24 >= STRONG_24H;
  metrics.push({
    key: 'reversal',
    label: 'Price reversal',
    level: isNaN(p1) ? 'UNKNOWN'
      : strongRun && p1 <= REVERSAL_SHARP ? 'SHARP'
      : strongRun && p1 <= REVERSAL_NOTABLE ? 'NOTABLE'
      : p1 <= REVERSAL_SHARP ? 'NOTABLE' : 'CALM',
    value: isNaN(p1) ? 'unknown' : pct(p1) + ' / 1h',
    fact: '24h: ' + pct(p24) + '  ·  1h: ' + pct(p1),
    reading: isNaN(p1) ? '' : strongRun && p1 < 0
      ? 'Sharp reversal after strong 24h appreciation.'
      : p1 < 0 ? 'Price is declining over the last hour.' : 'No reversal in the last hour.',
  });

  const traders = Number(h24.numTraders ?? NaN);
  const organic = Number(h24.numOrganicBuyers ?? NaN);
  const ratio = traders > 0 ? (organic / traders) * 100 : NaN;
  metrics.push({
    key: 'organic_participation',
    label: 'Organic participation',
    level: isNaN(ratio) ? 'UNKNOWN' : ratio <= ORGANIC_SHARP ? 'SHARP' : ratio <= ORGANIC_NOTABLE ? 'NOTABLE' : 'CALM',
    value: isNaN(ratio) ? 'unknown' : ratio.toFixed(1) + '%',
    fact: isNaN(ratio) ? 'No trader breakdown.' : num(organic) + ' organic buyers out of ' + num(traders) + ' traders (24h).',
    reading: isNaN(ratio) ? '' : ratio <= ORGANIC_NOTABLE
      ? 'Most trading activity is not coming from organic buyers.'
      : 'A meaningful share of activity comes from organic buyers.',
  });

  const buys = Number(h1.numBuys ?? NaN);
  const sells = Number(h1.numSells ?? NaN);
  const sr = buys > 0 ? sells / buys : NaN;
  metrics.push({
    key: 'pressure',
    label: 'Buy / sell pressure',
    level: isNaN(sr) ? 'UNKNOWN' : sr >= SELL_RATIO_SHARP ? 'SHARP' : sr >= SELL_RATIO_NOTABLE ? 'NOTABLE' : 'CALM',
    value: isNaN(sr) ? 'unknown' : num(sells) + ' sells / ' + num(buys) + ' buys',
    fact: isNaN(sr) ? 'No 1h trade counts.' : 'Over the last hour there were ' + num(sells) + ' sells and ' + num(buys) + ' buys.',
    reading: isNaN(sr) ? '' : sr > 1 ? 'Activity is shifting toward sellers.' : 'Buyers outnumber sellers.',
  });

  // --- deterministic explanation ---
  const explanation: Para[] = [];

  if (!isNaN(p1) || !isNaN(p24)) {
    explanation.push({
      title: 'Momentum',
      facts: ['24h price: ' + pct(p24), '1h price: ' + pct(p1)],
      text: strongRun && p1 <= REVERSAL_NOTABLE
        ? 'The token has moved dramatically higher over 24h, but the most recent hour shows a sharp reversal.'
        : strongRun
        ? 'The token has appreciated strongly over 24h and short-term momentum has not reversed.'
        : p1 < 0
        ? 'Price is declining over the last hour.'
        : 'Price is holding or rising over the last hour.',
    });
  }

  if (!isNaN(lq)) {
    explanation.push({
      title: 'Liquidity',
      facts: ['1h liquidity: ' + pct(lq), 'current liquidity: ' + money(snapshot.liquidity)],
      text: lq <= LIQ_DROP_SHARP
        ? 'Liquidity is being withdrawn from the pool while the price moves.'
        : lq < 0
        ? 'Liquidity is declining alongside the price move.'
        : 'Liquidity is stable or increasing.',
    });
  }

  if (!isNaN(ratio)) {
    explanation.push({
      title: 'Participation',
      facts: ['organic buyers: ' + ratio.toFixed(1) + '%', num(organic) + ' of ' + num(traders) + ' traders (24h)'],
      text: ratio <= ORGANIC_SHARP
        ? 'Almost none of the trading activity is classified as organic.'
        : ratio <= ORGANIC_NOTABLE
        ? 'Only a small share of traders are classified as organic buyers.'
        : 'A meaningful share of traders are classified as organic buyers.',
    });
  }

  const p5 = Number(m5.priceChange ?? NaN);
  const v5 = Number(m5.volumeChange ?? NaN);
  if (!isNaN(p5) && !isNaN(v5)) {
    explanation.push({
      title: 'Last 5 minutes',
      facts: ['5m price: ' + pct(p5), '5m volume: ' + pct(v5)],
      text: p5 > 0 && v5 < 0
        ? 'Price is recovering while trading activity is declining.'
        : p5 < 0 && v5 > 0
        ? 'Price is falling on rising activity.'
        : 'Short-term price and activity are moving in the same direction.',
    });
  }

  const unknown = metrics.filter(m => m.level === 'UNKNOWN').length;
  return {
    mint,
    symbol: tok.symbol,
    name: tok.name,
    decimals: Number(tok.decimals ?? 9),
    snapshot,
    rows,
    metrics,
    explanation,
    knownCount: metrics.length - unknown,
    totalCount: metrics.length,
  };
}

