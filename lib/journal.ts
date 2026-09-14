import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity } from './activity';

const KEY = 'alpha_journal_v1';
const MAX = 500;

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
  outcome?: {
    t: number;
    price?: number;
    liquidity?: number;
    holders?: number;
    priceChangePct?: number;
    liquidityChangePct?: number;
    holdersChangePct?: number;
  };
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

export async function logObservation(act: Activity) {
  try {
    const states: Record<string, string> = {};
    const values: Record<string, string> = {};
    for (const m of act.metrics) {
      states[m.key] = m.level;
      values[m.key] = m.value;
    }
    const obs: Observation = {
      id: act.mint + '_' + Date.now(),
      t: Date.now(),
      mint: act.mint,
      symbol: act.symbol,
      window: act.windows[act.windows.length - 1] ?? '5M',
      price: isFinite(Number(act.snapshot.price)) ? Number(act.snapshot.price) : undefined,
      liquidity: isFinite(Number(act.snapshot.liquidity)) ? Number(act.snapshot.liquidity) : undefined,
      holders: isFinite(Number(act.snapshot.holders)) ? Number(act.snapshot.holders) : undefined,
      mcap: isFinite(Number(act.snapshot.mcap)) ? Number(act.snapshot.mcap) : undefined,
      ageMinutes: act.snapshot.ageMinutes,
      states,
      values,
    };
    const list = await readAll();
    // avoid duplicate entries within 10 minutes for the same mint
    const recent = list.find(o => o.mint === act.mint && Date.now() - o.t < 600000);
    if (recent) return;
    list.push(obs);
    await writeAll(list);
  } catch {}
}

const pctChange = (a?: number, b?: number) =>
  a !== undefined && b !== undefined && a > 0 ? ((b - a) / a) * 100 : undefined;

export async function resolveOutcomes(minAgeMs = 3600000): Promise<number> {
  const list = await readAll();
  const pending = list.filter(o => !o.outcome && Date.now() - o.t >= minAgeMs);
  if (!pending.length) return 0;

  const mints = [...new Set(pending.map(o => o.mint))].slice(0, 12);
  let done = 0;

  for (const mint of mints) {
    try {
      const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + mint);
      const arr = await r.json();
      const tok = (Array.isArray(arr) ? arr : arr?.tokens ?? []).find((t: any) => (t.id ?? t.address) === mint);
      if (!tok) continue;

      const price = Number(tok.usdPrice ?? NaN);
      const liquidity = Number(tok.liquidity ?? NaN);
      const holders = Number(tok.holderCount ?? NaN);

      for (const o of pending.filter(x => x.mint === mint)) {
        o.outcome = {
          t: Date.now(),
          price: isFinite(price) ? price : undefined,
          liquidity: isFinite(liquidity) ? liquidity : undefined,
          holders: isFinite(holders) ? holders : undefined,
          priceChangePct: pctChange(o.price, isFinite(price) ? price : undefined),
          liquidityChangePct: pctChange(o.liquidity, isFinite(liquidity) ? liquidity : undefined),
          holdersChangePct: pctChange(o.holders, isFinite(holders) ? holders : undefined),
        };
        done++;
      }
    } catch {}
  }

  if (done) await writeAll(list);
  return done;
}

export async function journalStats() {
  const list = await readAll();
  const withOutcome = list.filter(o => o.outcome);
  return { total: list.length, resolved: withOutcome.length, pending: list.length - withOutcome.length };
}

export async function exportJournal(): Promise<string> {
  const list = await readAll();
  const head = 't,mint,symbol,ageMinutes,price,liquidity,holders,liquidity_trend,reversal,organic_participation,pressure,outcome_t,outcome_price,outcome_liquidity,priceChangePct,liquidityChangePct,holdersChangePct';
  const rows = list.map(o =>
    [
      new Date(o.t).toISOString(),
      o.mint,
      o.symbol ?? '',
      o.ageMinutes ?? '',
      o.price ?? '',
      o.liquidity ?? '',
      o.holders ?? '',
      o.states.liquidity_trend ?? '',
      o.states.reversal ?? '',
      o.states.organic_participation ?? '',
      o.states.pressure ?? '',
      o.outcome ? new Date(o.outcome.t).toISOString() : '',
      o.outcome?.price ?? '',
      o.outcome?.liquidity ?? '',
      o.outcome?.priceChangePct?.toFixed(2) ?? '',
      o.outcome?.liquidityChangePct?.toFixed(2) ?? '',
      o.outcome?.holdersChangePct?.toFixed(2) ?? '',
    ].join(',')
  );
  return [head, ...rows].join('\n');
}

export async function clearJournal() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}
