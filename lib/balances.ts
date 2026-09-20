const RPC = 'https://api.mainnet-beta.solana.com';

export type Balance = { mint: string; symbol?: string; name?: string; amount: number; usd?: number; price?: number };

async function rpc(method: string, params: any[]) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!r.ok) throw new Error('rpc');
  const j = await r.json();
  if (j.error) throw new Error(j.error.message ?? 'rpc');
  return j.result;
}

const SOL = 'So11111111111111111111111111111111111111112';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export async function getBalances(owner: string): Promise<{ list: Balance[]; total: number; status: 'OK' | 'ERROR' }> {
  try {
    const out: Balance[] = [];
    const lam = await rpc('getBalance', [owner]);
    const sol = Number(lam?.value ?? 0) / 1e9;
    if (sol > 0) out.push({ mint: SOL, symbol: 'SOL', amount: sol });

    for (const prog of [TOKEN, TOKEN22]) {
      try {
        const res = await rpc('getTokenAccountsByOwner', [owner, { programId: prog }, { encoding: 'jsonParsed' }]);
        for (const a of res?.value ?? []) {
          const info = a?.account?.data?.parsed?.info;
          const amt = Number(info?.tokenAmount?.uiAmount ?? 0);
          if (amt > 0 && info?.mint) out.push({ mint: info.mint, amount: amt });
        }
      } catch {}
    }

    const mints = out.map(b => b.mint).slice(0, 25);
    for (const m of mints) {
      try {
        const r = await fetch('https://lite-api.jup.ag/tokens/v2/search?query=' + m);
        if (!r.ok) continue;
        const arr = await r.json();
        const tok = (Array.isArray(arr) ? arr : arr?.tokens ?? []).find((t: any) => (t.id ?? t.address) === m);
        if (!tok) continue;
        const b = out.find(x => x.mint === m);
        if (!b) continue;
        b.symbol = tok.symbol ?? b.symbol;
        b.name = tok.name;
        const p = Number(tok.usdPrice ?? NaN);
        if (isFinite(p)) { b.price = p; b.usd = p * b.amount; }
      } catch {}
    }

    out.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
    const total = out.reduce((s, b) => s + (b.usd ?? 0), 0);
    return { list: out, total, status: 'OK' };
  } catch {
    return { list: [], total: 0, status: 'ERROR' };
  }
}