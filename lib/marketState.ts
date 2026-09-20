import {
  Metric, ActLevel,
  LIQ_DROP_SHARP, LIQ_DROP_NOTABLE,
  REVERSAL_SHARP, REVERSAL_NOTABLE,
  SELL_RATIO_SHARP, SELL_RATIO_NOTABLE,
} from './activity';

export const RULE_VERSION = 1;

export type StateKey =
  | 'INSUFFICIENT_DATA' | 'LIQUIDITY_STRESS' | 'MOMENTUM_WEAKENING'
  | 'SELLING_PRESSURE' | 'BUYING_MOMENTUM' | 'UNUSUAL_ACTIVITY'
  | 'MIXED' | 'CALM';

export type TraceRow = { n: number; state: StateKey; pass: boolean; rule: string };

export type MarketState = {
  state: StateKey;
  label: string;
  ruleVersion: number;
  facts: string;
  happening: string;
  means: string;
  watch: string;
  trace: TraceRow[];
};

// Price uses the existing reversal thresholds, symmetrically.
const PRICE_NOTABLE = Math.abs(REVERSAL_NOTABLE);
const PRICE_SHARP = Math.abs(REVERSAL_SHARP);

const rank = (l: ActLevel) => (l === 'SHARP' ? 2 : l === 'NOTABLE' ? 1 : 0);
const fmt = (v: number) => (isNaN(v) ? '--' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%');

export function computeMarketState(w: any, win: string, windowOk: boolean, metrics: Metric[]): MarketState {
  const pc = Number(w?.priceChange ?? NaN);
  const lc = Number(w?.liquidityChange ?? NaN);
  const hc = Number(w?.holderChange ?? NaN);
  const buys = Number(w?.numBuys ?? NaN);
  const sells = Number(w?.numSells ?? NaN);

  // price: direction + level
  const pAbs = Math.abs(pc);
  const pLevel: ActLevel = isNaN(pc) ? 'UNKNOWN' : pAbs >= PRICE_SHARP ? 'SHARP' : pAbs >= PRICE_NOTABLE ? 'NOTABLE' : 'CALM';
  const pUp = pc > 0 && rank(pLevel) >= 1;
  const pDown = pc < 0 && rank(pLevel) >= 1;

  // pressure: side + level, using the existing sell-ratio thresholds in both directions
  let side: 'BUY' | 'SELL' | 'BALANCED' | 'UNKNOWN' = 'UNKNOWN';
  let sLevel: ActLevel = 'UNKNOWN';
  if (buys > 0 && sells > 0) {
    const r = sells / buys;
    const inv = buys / sells;
    if (r >= SELL_RATIO_NOTABLE) { side = 'SELL'; sLevel = r >= SELL_RATIO_SHARP ? 'SHARP' : 'NOTABLE'; }
    else if (inv >= SELL_RATIO_NOTABLE) { side = 'BUY'; sLevel = inv >= SELL_RATIO_SHARP ? 'SHARP' : 'NOTABLE'; }
    else { side = 'BALANCED'; sLevel = 'CALM'; }
  } else if (buys > 0 && sells === 0) { side = 'BUY'; sLevel = 'SHARP'; }
  else if (sells > 0 && buys === 0) { side = 'SELL'; sLevel = 'SHARP'; }

  // liquidity
  const lLevel: ActLevel = isNaN(lc) ? 'UNKNOWN' : lc <= LIQ_DROP_SHARP ? 'SHARP' : lc <= LIQ_DROP_NOTABLE ? 'NOTABLE' : 'CALM';
  const lDown = rank(lLevel) >= 1;
  const lHolds = !isNaN(lc) && lc > LIQ_DROP_NOTABLE;

  const revLevel: ActLevel = metrics.find(m => m.key === 'reversal')?.level ?? 'UNKNOWN';
  const sharpCount = metrics.filter(m => m.level === 'SHARP').length;
  const anyActive = metrics.some(m => rank(m.level) >= 1) || rank(pLevel) >= 1 || rank(sLevel) >= 1;
  const missing = !windowOk || isNaN(pc) || isNaN(lc) || side === 'UNKNOWN';

  const facts = 'price ' + fmt(pc) + ' ' + pLevel
    + ' · liquidity ' + fmt(lc) + ' ' + lLevel
    + ' · pressure ' + side + ' ' + sLevel
    + ' · SHARP metrics ' + sharpCount;

  const rules: { state: StateKey; pass: boolean; rule: string }[] = [
    { state: 'INSUFFICIENT_DATA', pass: missing, rule: 'window n/a or key field missing' },
    { state: 'LIQUIDITY_STRESS', pass: lLevel === 'SHARP' && (rank(revLevel) >= 1 || rank(pLevel) >= 1), rule: 'liquidity down SHARP and (reversal or price move) >= NOTABLE' },
    { state: 'MOMENTUM_WEAKENING', pass: pUp && lDown && side === 'SELL', rule: 'price up >= NOTABLE, liquidity down >= NOTABLE, pressure SELL >= NOTABLE' },
    { state: 'SELLING_PRESSURE', pass: pDown && side === 'SELL' && sLevel === 'SHARP', rule: 'price down >= NOTABLE, pressure SELL SHARP' },
    { state: 'BUYING_MOMENTUM', pass: pUp && lHolds && side === 'BUY', rule: 'price up >= NOTABLE, liquidity not falling, pressure BUY >= NOTABLE' },
    { state: 'UNUSUAL_ACTIVITY', pass: sharpCount >= 3, rule: '3 or more metrics at SHARP' },
    { state: 'MIXED', pass: anyActive, rule: 'some NOTABLE/SHARP, no dominant pattern' },
    { state: 'CALM', pass: true, rule: 'no measure crossed NOTABLE' },
  ];

  const idx = rules.findIndex(r => r.pass);
  const trace: TraceRow[] = rules.slice(0, idx + 1).map((r, i) => ({ n: i, state: r.state, pass: i === idx, rule: r.rule }));
  const state = rules[idx].state;
  const holders = isNaN(hc) ? '' : ', holders ' + fmt(hc);

  let happening = '';
  let means = '';
  let watch = '';
  switch (state) {
    case 'INSUFFICIENT_DATA':
      happening = 'Not enough data for ' + win + '.';
      means = 'Missing evidence is not evidence.';
      watch = 'Choose a window the token is old enough for, or refresh.';
      break;
    case 'LIQUIDITY_STRESS':
      happening = 'Liquidity fell ' + fmt(lc) + ' in ' + win + ' while price moved ' + fmt(pc) + '.';
      means = 'Less liquidity means each trade moves price more.';
      watch = 'If liquidity keeps falling, price moves can become larger in both directions.';
      break;
    case 'MOMENTUM_WEAKENING':
      happening = 'Price is up ' + fmt(pc) + ', but liquidity is down ' + fmt(lc) + ' and sell trades outnumber buy trades.';
      means = 'The move is rising on thinning support.';
      watch = 'Liquidity is not following price. If this continues, the move has less support.';
      break;
    case 'SELLING_PRESSURE':
      happening = 'Price is down ' + fmt(pc) + ' and sell trades strongly outnumber buy trades.';
      means = 'Sellers are driving the current move.';
      watch = 'Whether sell activity eases or liquidity stabilizes.';
      break;
    case 'BUYING_MOMENTUM':
      happening = 'Price is up ' + fmt(pc) + ', liquidity is steady or rising, and buy trades outnumber sell trades.';
      means = 'The move is currently supported by liquidity and buying activity.';
      watch = 'Whether liquidity keeps pace with price. If it stops, support weakens.';
      break;
    case 'UNUSUAL_ACTIVITY':
      happening = sharpCount + ' measures are at SHARP levels at the same time.';
      means = 'Several measures are at extreme levels at once, without a clear direction.';
      watch = 'Which measure settles first.';
      break;
    case 'MIXED':
      happening = 'Price ' + fmt(pc) + ', liquidity ' + fmt(lc) + holders + ' in ' + win + '. Buy/sell trades: ' + side.toLowerCase() + '.';
      means = 'No single pattern dominates the current move.';
      watch = 'A shift in liquidity or in the buy/sell balance.';
      break;
    default:
      happening = 'No measure crossed its NOTABLE threshold in ' + win + '.';
      means = 'The measured activity is quiet.';
      watch = 'A shift in liquidity or in the buy/sell balance.';
  }

  return { state, label: state.replace(/_/g, ' '), ruleVersion: RULE_VERSION, facts, happening, means, watch, trace };
}