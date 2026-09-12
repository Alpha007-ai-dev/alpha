import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

const API_KEY = '7af24789ba4c4746905b91e4ebf6247a';
const POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
const SOL = 'So11111111111111111111111111111111111111112';

type Trade = { id: string; time: number; side: 'buy' | 'sell'; size: number; price: number };

export default function Index() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [stats, setStats] = useState({ vwap: 0, sd: 0, delta: 0, last: 0 });
  const seen = useRef<Set<string>>(new Set());
  const acc = useRef({ pv: 0, v: 0, pv2: 0, delta: 0 });
  const [anchor, setAnchor] = useState<'session' | 'day' | 'print'>('session');
  const anchorRef = useRef<'session' | 'day' | 'print'>('session');

  function resetAcc(label: 'session' | 'day' | 'print') {
    acc.current = { pv: 0, v: 0, pv2: 0, delta: 0 };
    anchorRef.current = label;
    setAnchor(label);
    setStats({ vwap: 0, sd: 0, delta: 0, last: 0 });
    setTrades([]);
    seen.current = new Set();
  }  async function loadDay() {
    try {
      const from = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
      const to = Math.floor(Date.now() / 1000);
      const url = 'https://public-api.birdeye.so/defi/ohlcv/pair?address=' + POOL + '&type=5m&time_from=' + from + '&time_to=' + to;
      const res = await fetch(url, { headers: { 'X-API-KEY': API_KEY, 'x-chain': 'solana', accept: 'application/json' } });
      const json = await res.json();
      const bars = json?.data?.items ?? [];
      if (!bars.length) return;

      const closes = bars.map((b: any) => Number(b.c)).filter((n: number) => n > 0).sort((a: number, b: number) => a - b);
      const median = closes[Math.floor(closes.length / 2)];

      let pv = 0, v = 0, pv2 = 0;
      for (const b of bars) {
        const px = Number(b.c);
        const vol = Number(b.v);
        if (!px || !vol) continue;
        if (px > median * 1.5 || px < median * 0.5) continue;
        pv += px * vol;
        v += vol;
        pv2 += px * px * vol;
      }
      if (!v) return;

      acc.current = { pv, v, pv2, delta: 0 };
      const vwap = pv / v;
      const variance = Math.max(pv2 / v - vwap * vwap, 0);
      setStats(s => ({ vwap, sd: Math.sqrt(variance), delta: 0, last: s.last }));
    } catch (e) {
      setErr(String(e));
    }
  }
  async function poll() {
    try {
      const url = 'https://public-api.birdeye.so/defi/txs/pair?address=' + POOL + '&offset=0&limit=50&sort_type=desc&tx_type=swap';
      const res = await fetch(url, { headers: { 'X-API-KEY': API_KEY, 'x-chain': 'solana', accept: 'application/json' } });
      const json = await res.json();
      const items = json?.data?.items ?? [];
      let fresh: Trade[] = [];
      for (const it of items) {
        if (!it?.txHash || seen.current.has(it.txHash)) continue;
        const toSol = it.to?.address === SOL;
        const fromSol = it.from?.address === SOL;
        if (!toSol && !fromSol) continue;
        const leg = toSol ? it.to : it.from;
        const size = Number(leg.uiAmount);
        const price = Number(leg.price);
        if (!size || !price) continue;
        seen.current.add(it.txHash);
        fresh.push({ id: it.txHash, time: it.blockUnixTime, side: toSol ? 'buy' : 'sell', size, price });
      }
      if (fresh.length) {
        fresh.sort((a, b) => a.time - b.time);
                if (anchorRef.current === 'print') {
          const idx = fresh.map((t, i) => (t.size >= 100 ? i : -1)).filter(i => i >= 0).pop();
          if (idx !== undefined) {
            acc.current = { pv: 0, v: 0, pv2: 0, delta: 0 };
            fresh = fresh.slice(idx);
          }
        }const a = acc.current;
        for (const t of fresh) {
          a.pv += t.price * t.size;
          a.v += t.size;
          a.pv2 += t.price * t.price * t.size;
          a.delta += t.side === 'buy' ? t.size : -t.size;
        }
        const vwap = a.pv / a.v;
        const variance = Math.max(a.pv2 / a.v - vwap * vwap, 0);
        setStats({ vwap, sd: Math.sqrt(variance), delta: a.delta, last: fresh[fresh.length - 1].price });
        setTrades(prev => fresh.slice().reverse().concat(prev).slice(0, 40));
      }
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }

  useEffect(() => {
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const above = stats.last > stats.vwap;

  return (
    <View style={s.root}>
      <Text style={s.brand}>ALPHA PRINTER</Text>
      <Text style={s.pair}>SOL / USDC</Text>
      <Text style={[s.price, { color: above ? '#22c55e' : '#ef4444' }]}>
        {stats.last ? stats.last.toFixed(3) : '--'}
      </Text>

      <View style={s.row}>
        <View style={s.cell}>
          <Text style={s.label}>VWAP</Text>
          <Text style={s.val}>{stats.vwap ? stats.vwap.toFixed(3) : '--'}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.label}>+1 SD</Text>
          <Text style={s.val}>{stats.sd ? (stats.vwap + stats.sd).toFixed(3) : '--'}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.label}>-1 SD</Text>
          <Text style={s.val}>{stats.sd ? (stats.vwap - stats.sd).toFixed(3) : '--'}</Text>
        </View>
      </View>

      <View style={s.row}>
        <View style={s.cell}>
          <Text style={s.label}>CVD (SOL)</Text>
          <Text style={[s.val, { color: stats.delta >= 0 ? '#22c55e' : '#ef4444' }]}>
            {stats.delta.toFixed(1)}
          </Text>
        </View>
      </View>

      {err ? <Text style={s.err}>{err}</Text> : null}

            <View style={s.anchorRow}>
        {(['session', 'day', 'print'] as const).map(k => (
          <Text
            key={k}
                        onPress={() => { resetAcc(k); if (k === 'day') loadDay(); }}
            style={[s.anchorBtn, anchor === k && s.anchorOn]}
          >
            {k === 'session' ? 'SESSION' : k === 'day' ? 'DAY' : 'LAST PRINT'}
          </Text>
        ))}
      </View><Text style={s.tapeHead}>TAPE</Text>
      <FlatList
        style={s.list}
        data={trades}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <View style={s.trade}>
            <Text style={s.time}>
              {new Date(item.time * 1000).toLocaleTimeString()}
            </Text>
            <Text style={[s.side, { color: item.side === 'buy' ? '#22c55e' : '#ef4444' }]}>
              {item.side === 'buy' ? 'B' : 'S'}
            </Text>
            <Text style={[s.size, item.size >= 100 && s.big]}>{item.size.toFixed(2)}</Text>
            <Text style={s.px}>{item.price.toFixed(3)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 60, paddingHorizontal: 16 },
  brand: { color: '#6b7280', fontSize: 11, letterSpacing: 3 },
  pair: { color: '#9ca3af', fontSize: 13, letterSpacing: 2, marginTop: 12 },
  price: { fontSize: 42, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', marginTop: 16 },
  cell: { flex: 1 },
  label: { color: '#4b5563', fontSize: 10, letterSpacing: 1 },
  val: { color: '#e5e7eb', fontSize: 16, fontVariant: ['tabular-nums'], marginTop: 2 },
  err: { color: '#ef4444', fontSize: 11, marginTop: 10 },
    anchorRow: { flexDirection: 'row', marginTop: 20, gap: 8 },
  anchorBtn: { color: '#4b5563', fontSize: 10, letterSpacing: 1, borderWidth: 1, borderColor: '#262626', paddingVertical: 6, paddingHorizontal: 10 },
  anchorOn: { color: '#22c55e', borderColor: '#22c55e' },tapeHead: { color: '#4b5563', fontSize: 10, letterSpacing: 2, marginTop: 24, marginBottom: 6 },
  list: { flex: 1 },
  trade: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#171717' },
  time: { color: '#4b5563', fontSize: 12, width: 90, fontVariant: ['tabular-nums'] },
  side: { fontSize: 12, width: 24, fontWeight: '700' },
  size: { color: '#9ca3af', fontSize: 12, flex: 1, fontVariant: ['tabular-nums'] },
  big: { color: '#fbbf24', fontWeight: '700' },
  px: { color: '#e5e7eb', fontSize: 12, fontVariant: ['tabular-nums'] },
});
