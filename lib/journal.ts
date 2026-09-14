import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity } from './activity';

const KEY = 'alpha_journal_v2';
const MAX = 500;

export const HORIZONS = [
  { key: '1h', ms: 3600000 },
  { key: '6h', ms: 21600000 },
  { key: '24h', ms: 86400000 },
];

export type Outcome = {
  horizon: string;
  t: number;
  ageMs: number;
  price?: number;
  liquidity?: number;
  holders?: number;
  mcap?: number;
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
      states,
      values,
      outcomes: [],
    });
    await writeAll(list);
  } catch {}
}

const pctChange = (a?: number, b?: number) =>
  a !== undefined && b !== undefined && a > 0 ? ((b - a) / a) * 100 : undefined;

function dueHorizons(o: Observation): string[] {
  const age = Date.now() - o.t;
  const have = new Set(o.outcomes.map(x => x.horizon));
  return HORIZONS.filter(h => age >= h.ms && !have.has(h.key)).map(h => h.key);
}

export async function resolveOutcomes(): Promise<number> {
  const list = await readAll();
  const pending = list.filter(o => dueHorizons(o).length > 0);
  if (!pending.length) return 0;

  const mints = [...new Set(pending.map(o => o.mint))].slice(0, 12);
  let done = 0;

  for (const mint of mints) {
    try {
      const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + mint);
      const arr = await r.json();
      const tok = (Array.isArray(arr) ? arr : arr?.tokens ?? []).find((t: any) => (t.id ?? t.address) === mint);
      if (!tok) continue;

      const price = numOrU(tok.usdPrice);
      const liquidity = numOrU(tok.liquidity);
      const holders = numOrU(tok.holderCount);
      const mcap = numOrU(tok.mcap);
      const now = Date.now();

      for (const o of pending.filter(x => x.mint === mint)) {
        for (const h of dueHorizons(o)) {
          o.outcomes.push({
            horizon: h,
            t: now,
            ageMs: now - o.t,
            price,
            liquidity,
            holders,
            mcap,
            priceChangePct: pctChange(o.price, price),
            liquidityChangePct: pctChange(o.liquidity, liquidity),
            holdersChangePct: pctChange(o.holders, holders),
          });
          done++;
        }
      }
    } catch {}
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
      rows.push(base.concat(['', '', '', '', '', '', '', '', '']).join(','));
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
        ]).join(','));
      }
    }
  }
  return [head, ...rows].join('\n');
}

export async function clearJournal() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
