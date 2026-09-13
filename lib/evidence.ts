export type Signal = {
  key: string;
  label: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  value: string;
  detail: string;
};

export type Evidence = {
  mint: string;
  symbol?: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  signals: Signal[];
};

const money = (n: number) =>
  n >= 1e9 ? '$' + (n / 1e9).toFixed(1) + 'B'
  : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K'
  : '$' + Math.round(n);

export async function getEvidence(mint: string): Promise<Evidence | null> {
  let tok: any = null;
  try {
    const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + mint);
    const arr = await r.json();
    tok = (Array.isArray(arr) ? arr : arr?.tokens ?? []).find(
      (t: any) => (t.id ?? t.address) === mint
    );
  } catch {}
  if (!tok) return null;

  const a = tok.audit ?? {};
  const s = tok.stats24h ?? {};
  const signals: Signal[] = [];

  // 1. Authorities
  const mintOff = a.mintAuthorityDisabled === true;
  const freezeOff = a.freezeAuthorityDisabled === true;
  signals.push({
    key: 'authorities',
    label: 'Token authorities',
    level: mintOff && freezeOff ? 'LOW' : !mintOff && !freezeOff ? 'HIGH' : 'MEDIUM',
    value: (mintOff ? 'mint off' : 'MINT ON') + ' / ' + (freezeOff ? 'freeze off' : 'FREEZE ON'),
    detail: mintOff && freezeOff
      ? 'Supply cannot be inflated and balances cannot be frozen.'
      : 'An active authority lets the creator mint new supply or freeze your tokens.',
  });

  // 2. Holder concentration
  const top = Number(a.topHoldersPercentage ?? NaN);
  signals.push({
    key: 'concentration',
    label: 'Holder concentration',
    level: isNaN(top) ? 'UNKNOWN' : top >= 50 ? 'HIGH' : top >= 25 ? 'MEDIUM' : 'LOW',
    value: isNaN(top) ? 'unknown' : top.toFixed(1) + '% in top holders',
    detail: 'A few wallets holding most of the supply can exit at any time.',
  });

  // 3. Creator history
  const dev = Number(a.devMints ?? NaN);
  signals.push({
    key: 'creator',
    label: 'Creator history',
    level: isNaN(dev) ? 'UNKNOWN' : dev >= 10 ? 'HIGH' : dev >= 3 ? 'MEDIUM' : 'LOW',
    value: isNaN(dev) ? 'unknown' : dev + ' token(s) by this creator',
    detail: 'Creators who launch many tokens rarely stay with any of them.',
  });

  // 4. Liquidity
  const liq = Number(tok.liquidity ?? 0);
  signals.push({
    key: 'liquidity',
    label: 'Liquidity',
    level: liq >= 500000 ? 'LOW' : liq >= 50000 ? 'MEDIUM' : 'HIGH',
    value: money(liq),
    detail: 'Thin liquidity means you may not be able to sell at the price you see.',
  });

  // 5. Organic activity
  const buy = Number(s.buyVolume ?? 0);
  const org = Number(s.buyOrganicVolume ?? 0);
  const ratio = buy > 0 ? (org / buy) * 100 : NaN;
  const deep = liq >= 5000000;
  signals.push({
    key: 'organic',
    label: 'Organic activity',
    level: deep ? 'LOW' : isNaN(ratio) ? 'UNKNOWN' : ratio >= 20 ? 'LOW' : ratio >= 5 ? 'MEDIUM' : 'HIGH',
    value: (isNaN(ratio) ? 'unknown' : ratio.toFixed(1) + '% of buy volume is organic') + (deep ? ' (deep market)' : ''),
    detail: deep
      ? 'In deep markets most volume is arbitrage and market making, so a low organic share is normal.'
      : 'Volume is easy to fake. Organic volume filters out bots and wash trading.',
  });

  // 6. Age
  const first = tok.firstPool?.createdAt ?? tok.createdAt;
  const days = first ? Math.floor((Date.now() - new Date(first).getTime()) / 86400000) : NaN;
  signals.push({
    key: 'age',
    label: 'Age',
    level: isNaN(days) ? 'UNKNOWN' : days >= 90 ? 'LOW' : days >= 14 ? 'MEDIUM' : 'HIGH',
    value: isNaN(days) ? 'unknown' : days + ' days since first pool',
    detail: 'Most rug pulls happen within the first two weeks.',
  });

  const highs = signals.filter(x => x.level === 'HIGH').length;
  const meds = signals.filter(x => x.level === 'MEDIUM').length;
  const risk = highs >= 2 ? 'HIGH' : highs === 1 || meds >= 3 ? 'MEDIUM' : 'LOW';

  return { risk, signals, mint, symbol: tok.symbol };
}


