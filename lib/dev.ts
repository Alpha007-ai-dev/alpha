import AsyncStorage from '@react-native-async-storage/async-storage';

const RPC = 'https://api.mainnet-beta.solana.com';
const KEY = 'alpha_dev_seen_v1';
const BASE_TTL = 24 * 3600 * 1000;

export type CreatorInfo = {
  dev?: string;
  pct?: number;
  source?: 'JUPITER' | 'CHAIN';
  basePct?: number;
  baseMints?: number;
  mints?: number;
  since?: number;
  newMints?: number;
};

async function chainBalance(owner: string, mint: string): Promise<number | undefined> {
  try {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [owner, { mint }, { encoding: 'jsonParsed' }],
      }),
    });
    if (!r.ok) return undefined;
    const j = await r.json();
    const arr: any[] = j?.result?.value;
    if (!Array.isArray(arr)) return undefined;
    let sum = 0;
    for (const a of arr) sum += Number(a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0);
    return sum;
  } catch {
    return undefined;
  }
}

export async function getCreatorInfo(
  mint: string, dev?: string, jupPct?: number, totalSupply?: number, devMints?: number,
): Promise<CreatorInfo> {
  let pct = jupPct;
  let source: CreatorInfo['source'] = jupPct !== undefined ? 'JUPITER' : undefined;
  if (pct === undefined && dev && totalSupply && totalSupply > 0) {
    const bal = await chainBalance(dev, mint);
    if (bal !== undefined) {
      pct = (bal / totalSupply) * 100;
      source = 'CHAIN';
    }
  }
  let base: any = null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all: Record<string, any> = raw ? JSON.parse(raw) : {};
    base = all[mint] ?? null;
    if (!base || Date.now() - base.t > BASE_TTL) {
      base = null;
      if (pct !== undefined || devMints !== undefined) {
        const now = Date.now();
        for (const k of Object.keys(all)) if (now - all[k].t > BASE_TTL) delete all[k];
        all[mint] = { pct, mints: devMints, t: now };
        await AsyncStorage.setItem(KEY, JSON.stringify(all));
      }
    }
  } catch {}
  return {
    dev,
    pct,
    source,
    basePct: base?.pct,
    baseMints: base?.mints,
    mints: devMints,
    since: base?.t,
    newMints: base && devMints !== undefined && base.mints !== undefined ? devMints - base.mints : undefined,
  };
}