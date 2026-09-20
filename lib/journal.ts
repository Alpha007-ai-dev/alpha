import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity } from './activity';

const KEY = 'alpha_journal_v2';
const MAX = 500;

export const HORIZONS = [
  { key: '1h', ms: 3600000, min: 2700000, max: 4500000 },
  { key: '6h', ms: 21600000, min: 18000000, max: 25200000 },
  { key: '24h', ms: 86400000, min: 79200000, max: 93600000 },
];

export type Outcome = {
  horizon: string;
  t: number;
  ageMs: number;
  price?: number;
  liquidity?: number;
  holders?: number;
  mcap?: number;
  devBalancePct?: number;
  priceChangePct?: number;
  liquidityChangePct?: number;
  holdersChangePct?: number;
};

export type Observation = {
  id: string;
  t: number;
  mint: string;
  symbol?: string;
  window: string;
  price?: number;
  liquidity?: number;
  holders?: number;
  mcap?: number;
  ageMinutes?: number;
  devBalancePct?: number;
  states: Record<string, string>;
  values: Record<string, string>;
  outcomes: Outcome[];
};

async function readAll(): Promise<Observation[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Observation[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: Observation[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {}
}

const numOrU = (v: any) => (isFinite(Number(v)) ? Number(v) : undefined);

import { computeMarketState } from './marketState';

export async function logObservation(act: Activity) {
  try {
    const states: Record<string, string> = {};
    const values: Record<string, string> = {};
    for (const m of act.metrics) {
      states[m.key] = m.level;
      values[m.key] = m.value;
    }
    const list = await readAll();
    const recent = list.find(o => o.mint === act.mint && Date.now() - o.t < 600000);
    if (recent) return;

    list.push({
      id: act.mint + '_' + Date.now(),
      t: Date.now(),
      mint: act.mint,
      symbol: act.symbol,
      window: act.windows[act.windows.length - 1] ?? '5M',
      price: numOrU(act.snapshot.price),
      liquidity: numOrU(act.snapshot.liquidity),
      holders: numOrU(act.snapshot.holders),
      mcap: numOrU(act.snapshot.mcap),
      ageMinutes: act.snapshot.ageMinutes,
      devBalancePct: act.snapshot.devBalancePct,
      ...(() => { const ms = computeMarketState(act.rawWindow, act.evidence?.window ?? '1h', !!act.rawWindow, act.metrics); return { marketState: ms.state, ruleVersion: ms.ruleVersion, msWindow: act.evidence?.window }; })(),
      states,
      values,
      outcomes: [],
    });
    await writeAll(list);
  } catch {}
}

const pctChange = (a?: number, b?: number) =>
  a !== undefined && b !== undefined && a > 0 ? ((b - a) / a) * 100 : undefined;

function dueHorizons(o: Observation): { key: string; missed: boolean }[] {
  const age = Date.now() - o.t;
  const have = new Set(o.outcomes.map(x => x.horizon));
  return HORIZONS
    .filter(h => age >= h.min && !have.has(h.key))
    .map(h => ({ key: h.key, missed: age > h.max }));
}

// Frozen outcome rule: UP >= +10%, DOWN <= -10%, else STABLE; no price -> NO_DATA
const classify = (pct?: number): string =>
  pct === undefined || isNaN(pct) ? 'NO_DATA' : pct >= 10 ? 'UP' : pct <= -10 ? 'DOWN' : 'STABLE';

export async function resolveOutcomes(): Promise<number> {
  const list = await readAll();
  const pending = list.filter(o => dueHorizons(o).length > 0);
  if (!pending.length) return 0;
  let done = 0;
  const now0 = Date.now();

  // 1) windows already closed: NO_DATA / MISSED_WINDOW, no fetch
  for (const o of pending) {
    for (const h of dueHorizons(o).filter(d => d.missed)) {
      o.outcomes.push({ horizon: h.key, t: now0, ageMs: now0 - o.t, outcome: 'NO_DATA', noDataReason: 'MISSED_WINDOW' } as any);
      done++;
    }
  }

  // 2) windows open now: fetch and record
  const open = list.filter(o => dueHorizons(o).some(d => !d.missed));
  const mints = [...new Set(open.map(o => o.mint))].slice(0, 12);

  for (const mint of mints) {
    let tok: any = null;
    let fetched = false;
    try {
      const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + mint);
      if (r.ok) {
        const arr = await r.json();
        fetched = true;
        tok = (Array.isArray(arr) ? arr : arr?.tokens ?? []).find((t: any) => (t.id ?? t.address) === mint) ?? null;
      }
    } catch {}
    if (!fetched) continue; // network error: retry later while the window is open

    const now = Date.now();
    for (const o of open.filter(x => x.mint === mint)) {
      for (const h of dueHorizons(o).filter(d => !d.missed)) {
        if (!tok) {
          o.outcomes.push({ horizon: h.key, t: now, ageMs: now - o.t, outcome: 'NO_DATA', noDataReason: 'TOKEN_NOT_FOUND' } as any);
          done++;
          continue;
        }
        const price = numOrU(tok.usdPrice);
        const liquidity = numOrU(tok.liquidity);
        const holders = numOrU(tok.holderCount);
        const mcap = numOrU(tok.mcap);
        const devBal = numOrU(tok.audit?.devBalancePercentage);
        const pc = pctChange(o.price, price);
        o.outcomes.push({
          horizon: h.key,
          t: now,
          ageMs: now - o.t,
          price,
          liquidity,
          holders,
          mcap,
          devBalancePct: devBal,
          priceChangePct: pc,
          liquidityChangePct: pctChange(o.liquidity, liquidity),
          holdersChangePct: pctChange(o.holders, holders),
          outcome: classify(pc),
          noDataReason: pc === undefined ? 'NO_PRICE' : undefined,
        } as any);
        done++;
      }
    }
  }

  if (done) await writeAll(list);
  return done;
}

export async function journalStats() {
  const list = await readAll();
  const resolved = list.filter(o => o.outcomes.length > 0).length;
  const complete = list.filter(o => o.outcomes.some(x => x.horizon === '24h')).length;
  return { total: list.length, resolved, complete, pending: list.length - resolved };
}

export async function exportJournal(): Promise<string> {
  const list = await readAll();
  const head = [
    'obs_t', 'mint', 'symbol', 'age_min',
    't0_price', 't0_liquidity', 't0_holders', 't0_mcap',
    'liquidity_trend', 'reversal', 'organic_participation', 'pressure', 'tradesize',
    'horizon', 'out_t', 'out_age_h', 'out_price', 'out_liquidity', 'out_holders',
    'price_chg_pct', 'liq_chg_pct', 'holders_chg_pct',
    'outcome', 'no_data_reason', 't0_dev_balance_pct', 'out_dev_balance_pct', 'market_state', 'rule_version', 'ms_window', 'decision', 'decision_t',
  ].join(',');

  const rows: string[] = [];
  for (const o of list) {
    const base = [
      new Date(o.t).toISOString(), o.mint, o.symbol ?? '', o.ageMinutes ?? '',
      o.price ?? '', o.liquidity ?? '', o.holders ?? '', o.mcap ?? '',
      o.states.liquidity_trend ?? '', o.states.reversal ?? '',
      o.states.organic_participation ?? '', o.states.pressure ?? '', o.states.tradesize ?? '',
    ];
    if (!o.outcomes.length) {
      rows.push(base.concat(['', '', '', '', '', '', '', '', '', '', '', String((o as any).devBalancePct ?? ''), '', String((o as any).marketState ?? ''), String((o as any).ruleVersion ?? ''), String((o as any).msWindow ?? ''), String((o as any).decision ?? ''), (o as any).decisionT ? new Date((o as any).decisionT).toISOString() : '']).join(','));
    } else {
      for (const x of o.outcomes) {
        rows.push(base.concat([
          x.horizon,
          new Date(x.t).toISOString(),
          (x.ageMs / 3600000).toFixed(1),
          String(x.price ?? ''),
          String(x.liquidity ?? ''),
          String(x.holders ?? ''),
          x.priceChangePct?.toFixed(2) ?? '',
          x.liquidityChangePct?.toFixed(2) ?? '',
          x.holdersChangePct?.toFixed(2) ?? '',
          String((x as any).outcome ?? ''),
          String((x as any).noDataReason ?? ''),
          String((o as any).devBalancePct ?? ''),
          String((x as any).devBalancePct ?? ''),
          String((o as any).marketState ?? ''),
          String((o as any).ruleVersion ?? ''),
          String((o as any).msWindow ?? ''),
          String((o as any).decision ?? ''),
          (o as any).decisionT ? new Date((o as any).decisionT).toISOString() : '',
        ]).join(','));
      }
    }
  }
  return [head, ...rows].join('\n');
}

export async function clearJournal() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}

export async function recordDecision(act: Activity, decision: 'BUY_DEMO' | 'PASS'): Promise<string> {
  try {
    await logObservation(act);
    const list = await readAll();
    let latest: any = null;
    for (const o of list) if (o.mint === act.mint && (!latest || o.t > latest.t)) latest = o;
    if (!latest) return 'ERROR';
    if (latest.decision) return latest.decision;
    latest.decision = decision;
    latest.decisionT = Date.now();
    await writeAll(list);
    return decision;
  } catch {
    return 'ERROR';
  }
}
