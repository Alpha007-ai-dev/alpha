export type FlowKey = 'CREATOR_SELLING' | 'FEW_WALLETS' | 'BUYING_MOMENTUM' | 'SELLING_PRESSURE' | 'FAST_IN_AND_OUT' | 'BALANCED_FLOW' | 'NO_DATA';

export type Flow = {
  key: FlowKey;
  label: string;
  support: string;
  windowLabel: string;
  trades: number;
  minutes: number;
  buyWallets: number;
  sellWallets: number;
  buyUsd: number;
  sellUsd: number;
  bothWallets: number;
  bothPct: number;
  topSellPct: number;
  topBuyPct: number;
  creatorTrades: { kind: string; usd: number; t: string }[];
  dustCount: number;
  dustPct: number;
  repeatAmount?: { usd: number; count: number };
  status: 'OK' | 'NO_POOL' | 'RATE_LIMIT' | 'ERROR';
};

const GT = 'https://api.geckoterminal.com/api/v2/networks/solana';
const TTL = 60 * 1000;
const cache: Record<string, { f: Flow; at: number }> = {};

// v1 thresholds, uncalibrated
export const FLOW_RULES = { walletRatio: 1.5, topShare: 60, bothShare: 25, repeatMin: 10, dustUsd: 5 };

const empty = (status: Flow['status']): Flow => ({
  key: 'NO_DATA', label: 'NO TRADE DATA', support: '', windowLabel: '', trades: 0, minutes: 0,
  buyWallets: 0, sellWallets: 0, buyUsd: 0, sellUsd: 0, bothWallets: 0, bothPct: 0,
  topSellPct: 0, topBuyPct: 0, creatorTrades: [], dustCount: 0, dustPct: 0, status,
});

const money = (v: number) => (v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + Math.round(v));

export async function getFlow(mint: string, pool: string | null, dev?: string): Promise<Flow> {
  const c = cache[mint];
  if (c && Date.now() - c.at < TTL) return c.f;
  if (!pool) return empty('NO_POOL');
  try {
    const r = await fetch(GT + '/pools/' + pool + '/trades?token=' + mint);
    if (r.status === 429) return empty('RATE_LIMIT');
    if (!r.ok) return empty('ERROR');
    const j = await r.json();
    const list: any[] = (j?.data ?? []).map((d: any) => d.attributes).filter((a: any) => a && a.tx_from_address);
    if (!list.length) return empty('NO_POOL');

    const usd = (a: any) => Number(a.volume_in_usd ?? 0);
    const buys = list.filter(a => a.kind === 'buy');
    const sells = list.filter(a => a.kind === 'sell');
    const sum = (arr: any[]) => arr.reduce((s, a) => s + usd(a), 0);
    const uniq = (arr: any[]) => Array.from(new Set(arr.map(a => a.tx_from_address)));
    const byWallet = (arr: any[]) => {
      const m: Record<string, number> = {};
      for (const a of arr) m[a.tx_from_address] = (m[a.tx_from_address] ?? 0) + usd(a);
      return Object.values(m).sort((x, y) => y - x);
    };
    const share = (arr: any[]) => {
      const tot = sum(arr);
      if (!tot) return 0;
      return (byWallet(arr).slice(0, 3).reduce((s, v) => s + v, 0) / tot) * 100;
    };

    const bw = uniq(buys);
    const sw = uniq(sells);
    const all = uniq(list);
    const both = bw.filter(w => sw.indexOf(w) >= 0);
    const buyUsd = sum(buys);
    const sellUsd = sum(sells);
    const ms = new Date(list[0].block_timestamp).getTime() - new Date(list[list.length - 1].block_timestamp).getTime();
    const minutes = Math.max(1, Math.round(ms / 60000));
    const dust = list.filter(a => usd(a) < FLOW_RULES.dustUsd);

    const amounts: Record<string, number> = {};
    for (const a of list) {
      const k = usd(a).toFixed(2);
      amounts[k] = (amounts[k] ?? 0) + 1;
    }
    let repeat: Flow['repeatAmount'];
    for (const k of Object.keys(amounts)) {
      if (amounts[k] >= FLOW_RULES.repeatMin && (!repeat || amounts[k] > repeat.count)) {
        repeat = { usd: Number(k), count: amounts[k] };
      }
    }

    const creatorTrades = dev
      ? list.filter(a => a.tx_from_address === dev).map(a => ({ kind: a.kind, usd: usd(a), t: a.block_timestamp }))
      : [];
    const topSellPct = share(sells);
    const topBuyPct = share(buys);
    const bothPct = all.length ? (both.length / all.length) * 100 : 0;

    let key: FlowKey = 'BALANCED_FLOW';
    let label = 'BALANCED FLOW';
    let support = bw.length + ' buyers vs ' + sw.length + ' sellers';
    const sold = creatorTrades.filter(x => x.kind === 'sell');
    if (sold.length) {
      key = 'CREATOR_SELLING';
      label = 'CREATOR SELLING';
      support = 'creator sold ' + money(sold.reduce((s, x) => s + x.usd, 0)) + ' in this window';
    } else if (topSellPct >= FLOW_RULES.topShare || topBuyPct >= FLOW_RULES.topShare) {
      const sellSide = topSellPct >= topBuyPct;
      key = 'FEW_WALLETS';
      label = 'FEW WALLETS DRIVE IT';
      support = 'top 3 ' + (sellSide ? 'sellers' : 'buyers') + ' made ' + Math.round(sellSide ? topSellPct : topBuyPct) + '% of the ' + (sellSide ? 'selling' : 'buying');
    } else if (sw.length > 0 && bw.length / sw.length >= FLOW_RULES.walletRatio && buyUsd > sellUsd) {
      key = 'BUYING_MOMENTUM';
      label = 'BUYING MOMENTUM';
      support = bw.length + ' buyers vs ' + sw.length + ' sellers · buy ' + money(buyUsd) + ' > sell ' + money(sellUsd);
    } else if (bw.length > 0 && sw.length / bw.length >= FLOW_RULES.walletRatio && sellUsd > buyUsd) {
      key = 'SELLING_PRESSURE';
      label = 'SELLING PRESSURE';
      support = sw.length + ' sellers vs ' + bw.length + ' buyers · sell ' + money(sellUsd) + ' > buy ' + money(buyUsd);
    } else if (bothPct >= FLOW_RULES.bothShare) {
      key = 'FAST_IN_AND_OUT';
      label = 'FAST IN AND OUT';
      support = both.length + ' wallets bought and sold within ' + minutes + ' min';
    }

    const f: Flow = {
      key, label, support,
      windowLabel: 'LAST ' + minutes + ' MIN',
      trades: list.length, minutes,
      buyWallets: bw.length, sellWallets: sw.length,
      buyUsd, sellUsd,
      bothWallets: both.length, bothPct,
      topSellPct, topBuyPct,
      creatorTrades,
      dustCount: dust.length,
      dustPct: (dust.length / list.length) * 100,
      repeatAmount: repeat,
      status: 'OK',
    };
    cache[mint] = { f, at: Date.now() };
    return f;
  } catch {
    return empty('ERROR');
  }
}

export const flowMoney = money;