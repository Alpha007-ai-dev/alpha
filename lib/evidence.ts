export type Level = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT_EVIDENCE';

export type Signal = {
  key: string;
  label: string;
  level: Level;
  value: string;
  detail: string;
  source: string;
  nearEdge?: boolean;
};

export type Evidence = {
  mint: string;
  symbol?: string;
  risk: Risk;
  verifiedCount: number;
  totalCount: number;
  highCount: number;
  signals: Signal[];
};

const RPC = 'https://api.mainnet-beta.solana.com';

const money = (n: number) =>
  n >= 1e9 ? '$' + (n / 1e9).toFixed(1) + 'B'
  : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M'
  : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K'
  : '$' + Math.round(n);

async function rpcAuthorities(mint: string) {
  try {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [mint, { encoding: 'jsonParsed' }],
      }),
    });
    const j = await r.json();
    const info = j?.result?.value?.data?.parsed?.info;
    if (!info) return null;
    return {
      mintAuthority: info.mintAuthority ?? null,
      freezeAuthority: info.freezeAuthority ?? null,
    };
  } catch {
    return null;
  }
}

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

  const auth = await rpcAuthorities(mint);
  const a = tok.audit ?? {};
  const liq = Number(tok.liquidity ?? 0);
  const signals: Signal[] = [];

  // 1. Authorities - fact, not override
  if (auth) {
    const mintOn = auth.mintAuthority !== null;
    const freezeOn = auth.freezeAuthority !== null;
    signals.push({
      key: 'authorities',
      label: 'Token authorities',
      level: mintOn && freezeOn ? 'HIGH' : mintOn || freezeOn ? 'MEDIUM' : 'LOW',
      value: (mintOn ? 'MINT ACTIVE' : 'mint revoked') + ' / ' + (freezeOn ? 'FREEZE ACTIVE' : 'freeze revoked'),
      detail: mintOn || freezeOn
        ? 'The issuer retains control over supply or balances. Normal for scheduled emissions and bridges, but it is also the most common rug setup.'
        : 'Supply cannot be inflated and balances cannot be frozen.',
      source: 'Solana RPC',
    });
  } else {
    signals.push({
      key: 'authorities', label: 'Token authorities', level: 'UNKNOWN',
      value: 'could not verify', detail: 'Authority state could not be read on-chain.',
      source: 'Solana RPC',
    });
  }

  const firstPoolAt = tok.firstPool?.createdAt ?? tok.createdAt;
  const ageDaysForCtx = firstPoolAt ? (Date.now() - new Date(firstPoolAt).getTime()) / 86400000 : 0;
  const mature = ageDaysForCtx >= 180;

  // 2. Holder concentration
  const top = Number(a.topHoldersPercentage ?? NaN);
  signals.push({
    key: 'concentration',
    label: 'Holder concentration',
    level: isNaN(top) ? 'UNKNOWN' : top >= 60 ? 'HIGH' : top >= 35 ? 'MEDIUM' : 'LOW',
    value: isNaN(top) ? 'unknown' : top.toFixed(1) + '% in top holders',
    detail: isNaN(top)
      ? 'Holder distribution could not be read.'
      : mature
      ? 'On established tokens the largest accounts are often exchange custody wallets rather than individual sellers. Check the top holders before reading this as exit risk.'
      : 'On a young token, concentrated supply means a few wallets can exit at any time. Pool and burn addresses may be included in this figure.',
    source: 'Jupiter audit',
    nearEdge: !isNaN(top) && (Math.abs(top - 60) < 5 || Math.abs(top - 35) < 5),
  });

  // 3. Creator exposure - what they hold, not how many they launched
  const devBal = Number(a.devBalancePercentage ?? NaN);
  const devMints = Number(a.devMints ?? NaN);
  signals.push({
    key: 'creator',
    label: 'Creator exposure',
    level: isNaN(devBal) ? 'UNKNOWN' : devBal >= 10 ? 'HIGH' : devBal >= 2 ? 'MEDIUM' : 'LOW',
    value: isNaN(devBal)
      ? 'unknown'
      : devBal < 0.01
      ? 'creator holds none' + (isNaN(devMints) ? '' : ' (' + devMints + ' tokens launched)')
      : devBal.toFixed(2) + '% held by creator' + (isNaN(devMints) ? '' : ' (' + devMints + ' tokens launched)'),
    detail: 'What matters is how much the creator can still sell, not how many tokens they have launched.',
    source: 'Jupiter audit',
  });

  // 3b. Deployer track record
  const devMig = Number(a.devMigrations ?? NaN);
  const migRate = !isNaN(devMints) && devMints > 0 && !isNaN(devMig) ? (devMig / devMints) * 100 : NaN;
  signals.push({
    key: 'deployer',
    label: 'Deployer track record',
    level: isNaN(migRate) ? 'UNKNOWN'
      : devMints < 3 ? 'LOW'
      : migRate < 15 ? 'HIGH'
      : migRate < 40 ? 'MEDIUM' : 'LOW',
    value: isNaN(migRate)
      ? 'unknown'
      : devMig + ' of ' + devMints + ' launches migrated (' + migRate.toFixed(0) + '%)',
    detail: isNaN(migRate)
      ? 'No launch history available for this deployer.'
      : devMints < 3
      ? 'This deployer has launched very few tokens, so there is little history to read.'
      : 'Migration means a launch reached a real market instead of being abandoned. A low rate across many launches shows a high-volume launcher.',
    source: 'Jupiter audit',
  });

  // 4. Liquidity
  signals.push({
    key: 'liquidity',
    label: 'Liquidity',
    level: liq <= 0 ? 'UNKNOWN' : liq >= 250000 ? 'LOW' : liq >= 50000 ? 'MEDIUM' : 'HIGH',
    value: liq <= 0 ? 'unknown' : money(liq),
    detail: 'Thin liquidity means you may not be able to sell at the price you see.',
    source: 'Jupiter',
    nearEdge: liq > 0 && (Math.abs(liq - 250000) / 250000 < 0.15 || Math.abs(liq - 50000) / 50000 < 0.15),
  });

  // 5. Liquidity quality - use Jupiter organic score
  const label = String(tok.organicScoreLabel ?? '').toLowerCase();
  const score = Number(tok.organicScore ?? NaN);
  signals.push({
    key: 'organic',
    label: 'Liquidity quality',
    level: label === 'high' ? 'LOW' : label === 'medium' ? 'MEDIUM' : label === 'low' ? 'HIGH' : 'UNKNOWN',
    value: label ? 'organic score ' + label + (isNaN(score) ? '' : ' (' + score.toFixed(0) + ')') : 'unknown',
    detail: 'Volume is easy to fake. Organic score filters out bots and wash trading.',
    source: 'Jupiter organicScore',
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
    source: 'Jupiter firstPool',
    nearEdge: !isNaN(days) && (Math.abs(days - 90) <= 7 || Math.abs(days - 14) <= 3),
  });

  const total = signals.length;
  const unknown = signals.filter(x => x.level === 'UNKNOWN').length;
  const verifiedCount = total - unknown;
  const highs = signals.filter(x => x.level === 'HIGH').length;
  const meds = signals.filter(x => x.level === 'MEDIUM').length;

  let risk: Risk;
  if (unknown >= 4) {
    risk = 'INSUFFICIENT_EVIDENCE';
  } else if (highs >= 3) {
    risk = 'HIGH';
  } else if (highs === 2 || (highs === 1 && meds >= 2) || meds >= 4) {
    risk = 'MEDIUM';
  } else if (highs === 1 || meds >= 2) {
    risk = 'MEDIUM';
  } else {
    risk = 'LOW';
  }

  return { mint, symbol: tok.symbol, risk, verifiedCount, totalCount: total, highCount: highs, signals };
}

