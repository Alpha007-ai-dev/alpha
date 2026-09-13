export type Status = 'VERIFIED' | 'AMBIGUOUS' | 'UNVERIFIED';

export type Candidate = {
  mint: string;
  symbol?: string;
  name?: string;
  liquidity?: number;
    verified?: boolean;source: string;
};

export type Result = {
  status: Status;
  kind: string;
  candidates: Candidate[];
  note?: string;
};

const RPC = 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const B58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

export async function verifyMint(addr: string): Promise<boolean> {
  try {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [addr, { encoding: 'jsonParsed' }],
      }),
    });
    const j = await res.json();
    const v = j?.result?.value;
    if (!v) return false;
    const ownerOk = v.owner === TOKEN_PROGRAM || v.owner === TOKEN_2022;
    const isMint = v.data?.parsed?.type === 'mint';
    return ownerOk && isMint;
  } catch {
    return false;
  }
}

async function dexPair(pair: string): Promise<Candidate | null> {
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/pairs/solana/' + pair);
    const j = await r.json();
    const p = j?.pairs?.[0] ?? j?.pair;
    if (!p?.baseToken?.address) return null;
    return {
      mint: p.baseToken.address,
      symbol: p.baseToken.symbol,
      name: p.baseToken.name,
      liquidity: Number(p.liquidity?.usd ?? 0),
      source: 'dexscreener pair',
    };
  } catch {
    return null;
  }
}

async function searchTicker(t: string): Promise<Candidate[]> {
  const byMint = new Map<string, Candidate>();

  try {
    const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(t));
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j?.tokens ?? []);
    for (const tok of arr) {
      const mint = tok.id ?? tok.address;
      if (!mint || (tok.symbol ?? '').toUpperCase() !== t.toUpperCase()) continue;
      byMint.set(mint, {
        mint,
        symbol: tok.symbol,
        name: tok.name,
        liquidity: Number(tok.liquidity ?? 0),
        verified: tok.isVerified === true,
        source: 'jupiter',
      });
    }
  } catch {}

  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(t));
    const j = await r.json();
    for (const p of j?.pairs ?? []) {
      if (p.chainId !== 'solana') continue;
      for (const side of [p.baseToken, p.quoteToken]) {
        if (!side?.address) continue;
        if ((side.symbol ?? '').toUpperCase() !== t.toUpperCase()) continue;
        if (byMint.has(side.address)) continue;
        byMint.set(side.address, {
          mint: side.address,
          symbol: side.symbol,
          name: side.name,
          liquidity: Number(p.liquidity?.usd ?? 0),
          verified: false,
          source: 'dexscreener',
        });
      }
    }
  } catch {}

  return [...byMint.values()].sort(
    (a, b) => Number(b.verified) - Number(a.verified) || (b.liquidity ?? 0) - (a.liquidity ?? 0)
  );
}
export async function resolve(raw: string): Promise<Result> {
  const input = (raw || '').trim();
  if (!input) return { status: 'UNVERIFIED', kind: 'empty', candidates: [] };

  const low = input.toLowerCase();

  if (low.includes('dexscreener.com/solana/')) {
    const m = input.match(/dexscreener\.com\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})/i);
    if (m) {
      const c = await dexPair(m[1]);
      if (c && (await verifyMint(c.mint))) {
        return { status: 'VERIFIED', kind: 'dexscreener url', candidates: [c] };
      }
      return { status: 'UNVERIFIED', kind: 'dexscreener url', candidates: [], note: 'Pair could not be resolved.' };
    }
  }

  if (low.includes('outputmint=')) {
    const m = input.match(/outputMint=([1-9A-HJ-NP-Za-km-z]{32,44})/i);
    if (m && (await verifyMint(m[1]))) {
      return { status: 'VERIFIED', kind: 'jupiter url', candidates: [{ mint: m[1], source: 'jupiter url' }] };
    }
  }

  const known = ['solscan.io/token/', 'birdeye.so/token/', 'pump.fun/coin/', 'jup.ag/'];
  const isKnownUrl = known.some(k => low.includes(k));

  const found = input.match(B58) ?? [];
  const uniq = [...new Set(found)];
  const verified: Candidate[] = [];
  for (const a of uniq.slice(0, 5)) {
    if (await verifyMint(a)) verified.push({ mint: a, source: isKnownUrl ? 'url' : 'address in text' });
  }
  if (verified.length === 1) {
    return { status: 'VERIFIED', kind: isKnownUrl ? 'known url' : 'text with address', candidates: verified };
  }
  if (verified.length > 1) {
    return { status: 'AMBIGUOUS', kind: 'multiple addresses', candidates: verified, note: 'More than one mint found.' };
  }

  const tick = input.match(/\$([A-Za-z][A-Za-z0-9]{1,9})\b/);
  if (tick) {
    const cands = await searchTicker(tick[1]);
       const vers = cands.filter(c => c.verified);
    if (vers.length === 1 && cands.length === 1) {
      return { status: 'VERIFIED', kind: 'ticker', candidates: cands };
    }
    if (cands.length > 1) {
      return {
        status: 'AMBIGUOUS',
        kind: 'ticker',
        candidates: cands.slice(0, 8),
        note: 'Ticker is not unique.',
      };
    }
  }

  return { status: 'UNVERIFIED', kind: 'unknown', candidates: [], note: 'Token could not be verified.' };
}
