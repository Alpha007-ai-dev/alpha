import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'alpha_candidates_v1';
const MAX = 2000;

export type Candidate = {
  mint: string;
  firstSeen: number;
  lastSeen: number;
  sources: string[];
  seenCount: number;
};

const ENDPOINTS = [
  { url: 'https://api.dexscreener.com/token-profiles/latest/v1', source: 'profile' },
  { url: 'https://api.dexscreener.com/token-boosts/latest/v1', source: 'boost' },
];

async function readAll(): Promise<Candidate[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Candidate[]) : [];
  } catch {
    return [];
  }
}

export async function collectCandidates(): Promise<{ added: number; total: number }> {
  const list = await readAll();
  const byMint = new Map(list.map(c => [c.mint, c]));
  const now = Date.now();
  let added = 0;

  for (const ep of ENDPOINTS) {
    try {
      const r = await fetch(ep.url);
      const arr = await r.json();
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (item?.chainId !== 'solana') continue;
        const mint = item.tokenAddress;
        if (!mint) continue;
        const ex = byMint.get(mint);
        if (ex) {
          ex.lastSeen = now;
          ex.seenCount++;
          if (!ex.sources.includes(ep.source)) ex.sources.push(ep.source);
        } else {
          byMint.set(mint, { mint, firstSeen: now, lastSeen: now, sources: [ep.source], seenCount: 1 });
          added++;
        }
      }
    } catch {}
  }

  const out = [...byMint.values()].slice(-MAX);
  try { await AsyncStorage.setItem(KEY, JSON.stringify(out)); } catch {}
  return { added, total: out.length };
}

export async function candidateStats() {
  const list = await readAll();
  return { total: list.length };
}

export async function exportCandidates(): Promise<string> {
  const list = await readAll();
  const head = 'mint,firstSeen,lastSeen,sources,seenCount';
  const rows = list.map(c =>
    [c.mint, new Date(c.firstSeen).toISOString(), new Date(c.lastSeen).toISOString(), c.sources.join('|'), c.seenCount].join(',')
  );
  return [head, ...rows].join('\n');
}
