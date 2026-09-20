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
  ageMinutes?: number;
  devBalancePct?: number;
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
  windows: string[];
  metrics: Metric[];
  explanation: Para[];
  knownCount: number;
  totalCount: number;
  youngNote?: string;
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
  const ageMs = first ? Date.now() - new Date(first).getTime() : NaN;
  const ageMinutes = isNaN(ageMs) ? undefined : Math.floor(ageMs / 60000);
  const ageDays = isNaN(ageMs) ? undefined : Math.floor(ageMs / 86400000);

  // which windows actually have history behind them
  const am = ageMinutes ?? 99999;
  const has1h = am >= 60;
  const has6h = am >= 360;
  const has24h = am >= 1440;
  const windows = ['5M'];
  if (has1h) windows.push('1H');
  if (has6h) windows.push('6H');
  if (has24h) windows.push('24H');

  let youngNote: string | undefined;
  if (!has24h) {
    const label = am < 60 ? am + ' minutes' : Math.floor(am / 60) + ' hours';
    youngNote = 'Token is ' + label + ' old. Longer timeframes have no history yet and are hidden.';
  }

  const snapshot: Snapshot = {
    price: Number(tok.usdPrice ?? NaN),
    mcap: Number(tok.mcap ?? NaN),
    fdv: Number(tok.fdv ?? NaN),
    liquidity: Number(tok.liquidity ?? NaN),
    holders: Number(tok.holderCount ?? NaN),
    ageDays,
    ageMinutes,
    devBalancePct: isFinite(Number(tok.audit?.devBalancePercentage)) ? Number(tok.audit.devBalancePercentage) : undefined,
  };

  const NA = 'n/a';
  const bvol = (w: any, ok: boolean) => (!ok ? NA : Number(w.buyVolume ?? 0) > 0 ? money(w.buyVolume) : '--');
  const svol = (w: any, ok: boolean) => (!ok ? NA : Number(w.sellVolume ?? 0) > 0 ? money(w.sellVolume) : '--');
  const vol = (w: any, ok: boolean) => {
    if (!ok) return NA;
    const b = w.buyVolume === undefined || w.sellVolume === undefined ? NaN : Number(w.buyVolume) + Number(w.sellVolume);
    return b > 0 ? money(b) : '--';
  };
  const bs = (w: any, ok: boolean) => (!ok ? NA : w.numBuys !== undefined ? num(w.numBuys) + ' / ' + num(w.numSells) : '--');
  const ch = (v: any, ok: boolean) => (ok ? pct(v) : NA);

  const rows: Row[] = [
    { label: 'Price', m5: pct(m5.priceChange), h1: ch(h1.priceChange, has1h), h6: ch(h6.priceChange, has6h), h24: ch(h24.priceChange, has24h) },
    { label: 'Liquidity', m5: pct(m5.liquidityChange), h1: ch(h1.liquidityChange, has1h), h6: ch(h6.liquidityChange, has6h), h24: ch(h24.liquidityChange, has24h) },
    { label: 'Holders', m5: pct(m5.holderChange), h1: ch(h1.holderChange, has1h), h6: ch(h6.holderChange, has6h), h24: ch(h24.holderChange, has24h) },
    { label: 'Buy vol', m5: bvol(m5, true), h1: bvol(h1, has1h), h6: bvol(h6, has6h), h24: bvol(h24, has24h) },
    { label: 'Sell vol', m5: svol(m5, true), h1: svol(h1, has1h), h6: svol(h6, has6h), h24: svol(h24, has24h) },
    { label: 'Buys/Sells', m5: bs(m5, true), h1: bs(h1, has1h), h6: bs(h6, has6h), h24: bs(h24, has24h) },
  ];

  // primary window: the shortest one with real history for trend metrics
  const W = has1h ? h1 : m5;
  const WLBL = has1h ? '1h' : '5m';

  const metrics: Metric[] = [];

  const lq = Number(W.liquidityChange ?? NaN);
  metrics.push({
    key: 'liquidity_trend',
    label: 'Liquidity',
    level: isNaN(lq) ? 'UNKNOWN' : lq <= LIQ_DROP_SHARP ? 'SHARP' : lq <= LIQ_DROP_NOTABLE ? 'NOTABLE' : 'CALM',
    value: isNaN(lq) ? 'unknown' : pct(lq) + ' / ' + WLBL,
    fact: isNaN(lq) ? 'No liquidity data.' : 'Pool liquidity changed ' + pct(lq) + ' over the last ' + WLBL + '.',
    reading: isNaN(lq) ? '' : lq < 0 ? 'Liquidity is leaving the pool.' : 'Liquidity is stable or growing.',
  });

  const pShort = Number(W.priceChange ?? NaN);
  const pLong = has24h ? Number(h24.priceChange ?? NaN) : NaN;
  const strongRun = !isNaN(pLong) && pLong >= STRONG_24H;
  metrics.push({
    key: 'reversal',
    label: 'Price reversal',
    level: isNaN(pShort) ? 'UNKNOWN'
      : strongRun && pShort <= REVERSAL_SHARP ? 'SHARP'
      : strongRun && pShort <= REVERSAL_NOTABLE ? 'NOTABLE'
      : pShort <= REVERSAL_SHARP ? 'NOTABLE' : 'CALM',
    value: isNaN(pShort) ? 'unknown' : pct(pShort) + ' / ' + WLBL,
    fact: (has24h ? '24h: ' + pct(pLong) + '  ·  ' : '') + WLBL + ': ' + pct(pShort),
    reading: isNaN(pShort) ? ''
      : strongRun && pShort < 0 ? 'Sharp reversal after strong 24h appreciation.'
      : !has24h ? 'No longer-term history to compare against yet.'
      : pShort < 0 ? 'Price is declining.' : 'No reversal in this window.',
  });

  // organic participation: traders if available, else volume share
  const traders = Number(W.numTraders ?? NaN);
  const organicBuyers = Number(W.numOrganicBuyers ?? NaN);
  const buyVol = Number(W.buyVolume ?? NaN);
  const orgVol = Number(W.buyOrganicVolume ?? NaN);

  let ratio = NaN;
  let oFact = 'No participation data.';
  if (traders > 0 && !isNaN(organicBuyers)) {
    ratio = (organicBuyers / traders) * 100;
    oFact = num(organicBuyers) + ' organic buyers out of ' + num(traders) + ' traders (' + WLBL + ').';
  } else if (buyVol > 0 && !isNaN(orgVol)) {
    ratio = (orgVol / buyVol) * 100;
    oFact = money(orgVol) + ' organic of ' + money(buyVol) + ' buy volume (' + WLBL + ').';
  }

  metrics.push({
    key: 'organic_participation',
    label: 'Organic participation',
    level: isNaN(ratio) ? 'UNKNOWN' : ratio <= ORGANIC_SHARP ? 'SHARP' : ratio <= ORGANIC_NOTABLE ? 'NOTABLE' : 'CALM',
    value: isNaN(ratio) ? 'unknown' : (ratio < 0.1 ? ratio.toFixed(3) : ratio.toFixed(1)) + '%',
    fact: oFact,
    reading: isNaN(ratio) ? '' : ratio <= ORGANIC_NOTABLE
      ? 'Most trading activity is not coming from organic buyers.'
      : 'A meaningful share of activity comes from organic buyers.',
  });

  const buys = Number(W.numBuys ?? NaN);
  const sells = Number(W.numSells ?? NaN);
  const sr = buys > 0 ? sells / buys : NaN;
  const perWallet = traders > 0 && !isNaN(buys) && !isNaN(sells) ? (buys + sells) / traders : NaN;
  metrics.push({
    key: 'pressure',
    label: 'Buy / sell pressure',
    level: isNaN(sr) ? 'UNKNOWN' : sr >= SELL_RATIO_SHARP ? 'SHARP' : sr >= SELL_RATIO_NOTABLE ? 'NOTABLE' : 'CALM',
    value: isNaN(sr) ? 'unknown' : num(sells) + ' sells / ' + num(buys) + ' buys',
    fact: (isNaN(sr) ? 'No trade counts.' : 'Over the last ' + WLBL + ': ' + num(sells) + ' sells, ' + num(buys) + ' buys.')
      + (isNaN(perWallet) ? '' : '  ' + perWallet.toFixed(1) + ' trades per wallet.'),
    reading: isNaN(sr) ? '' : sr > 1 ? 'Sellers outnumber buyers.' : 'Buyers outnumber sellers.',
  });

  // average trade size on each side
  const bVol = Number(W.buyVolume ?? NaN);
  const sVol = Number(W.sellVolume ?? NaN);
  const avgBuy = buys > 0 && !isNaN(bVol) ? bVol / buys : NaN;
  const avgSell = sells > 0 && !isNaN(sVol) ? sVol / sells : NaN;
  const sizeRatio = !isNaN(avgBuy) && avgBuy > 0 && !isNaN(avgSell) ? avgSell / avgBuy : NaN;
  metrics.push({
    key: 'tradesize',
    label: 'Average trade size',
    level: isNaN(sizeRatio) ? 'UNKNOWN' : sizeRatio >= 3 ? 'SHARP' : sizeRatio >= 1.5 ? 'NOTABLE' : 'CALM',
    value: isNaN(sizeRatio) ? 'unknown' : 'sells ' + sizeRatio.toFixed(1) + 'x buys',
    fact: isNaN(sizeRatio)
      ? 'No per-side volume data.'
      : 'Average buy ' + money(avgBuy) + ' · average sell ' + money(avgSell) + ' (' + WLBL + ').',
    reading: isNaN(sizeRatio)
      ? ''
      : sizeRatio >= 1.5
      ? 'Average sell is larger than average buy.'
      : sizeRatio <= 0.67
      ? 'Buys are larger than sells.'
      : 'Buy and sell sizes are broadly balanced.',
  });

  const explanation: Para[] = [];

  if (!isNaN(pShort)) {
    explanation.push({
      title: 'Momentum',
      facts: (has24h ? ['24h price: ' + pct(pLong)] : []).concat([WLBL + ' price: ' + pct(pShort)]),
      text: strongRun && pShort <= REVERSAL_NOTABLE
        ? 'The token has moved dramatically higher over 24h, but the most recent window shows a sharp reversal.'
        : !has24h
        ? 'The token is too young for longer-term comparison. Only short-term movement is available.'
        : pShort < 0 ? 'Price is declining in the most recent window.' : 'Price is holding or rising.',
    });
  }

  if (!isNaN(lq)) {
    explanation.push({
      title: 'Liquidity',
      facts: [WLBL + ' liquidity: ' + pct(lq), 'current liquidity: ' + money(snapshot.liquidity)],
      text: lq <= LIQ_DROP_SHARP
        ? 'Liquidity is being withdrawn from the pool while the price moves.'
        : lq < 0 ? 'Liquidity is declining alongside the price move.' : 'Liquidity is stable or increasing.',
    });
  }

  if (!isNaN(ratio)) {
    explanation.push({
      title: 'Participation',
      facts: [oFact],
      text: ratio <= ORGANIC_SHARP
        ? 'Almost none of the trading activity is classified as organic.'
        : ratio <= ORGANIC_NOTABLE
        ? 'Only a small share of activity is classified as organic.'
        : 'A meaningful share of activity is classified as organic.',
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
    windows,
    metrics,
    explanation,
    knownCount: metrics.length - unknown,
    totalCount: metrics.length,
    youngNote,
  };
}


