import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { resolve, Result } from '../lib/resolver';
import { getEvidence, Evidence } from '../lib/evidence';
import { getActivity, Activity } from '../lib/activity';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { getQuote, Quote, fmtAmount, PLATFORM_FEE_BPS, buildSwapTx, decodeTx } from '../lib/swap';

const lv = (l: string) =>
  l === 'HIGH' ? '#ef4444' : l === 'MEDIUM' ? '#fbbf24' : l === 'LOW' ? '#22c55e' : '#6b7280';

const av = (l: string) =>
  l === 'SHARP' ? '#ef4444' : l === 'NOTABLE' ? '#fbbf24' : l === 'CALM' ? '#22c55e' : '#6b7280';

const riskColor = (r: string) =>
  r === 'HIGH' ? '#ef4444' : r === 'MEDIUM' ? '#fbbf24' : r === 'LOW' ? '#22c55e' : '#6b7280';

const fmtMoney = (v?: number) => {
  if (v === undefined || isNaN(v) || v <= 0) return '--';
  return v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B'
    : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M'
    : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K'
    : '$' + v.toFixed(v < 1 ? 6 : 2);
};

const tint = (t: string) =>
  t.startsWith('-') ? '#ef4444' : t.startsWith('+') ? '#22c55e' : '#9ca3af';

export default function Index() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [ev, setEv] = useState<Evidence | null>(null);
  const [act, setAct] = useState<Activity | null>(null);
  const [evBusy, setEvBusy] = useState(false);
  const [evErr, setEvErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'live' | 'profile'>('live');
  const [openExp, setOpenExp] = useState(false);
  const { account, connect, disconnect, signAndSendTransaction } = useMobileWallet();
  const [sBusy, setSBusy] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [sErr, setSErr] = useState<string | null>(null);

  async function doSwap() {
    if (!quote || !account) return;
    setSBusy(true); setSErr(null); setSig(null);
    try {
      const b64 = await buildSwapTx(quote, String(account.address));
      if (!b64) { setSErr('Could not build transaction.'); setSBusy(false); return; }
      const tx = decodeTx(b64);
      const result = await signAndSendTransaction(tx, BigInt(quote.contextSlot));
      setSig(String(Array.isArray(result) ? result[0] : result));
    } catch (e) {
      setSErr(String(e));
    }
    setSBusy(false);
  }
  const [wBusy, setWBusy] = useState(false);
  const [payAmt, setPayAmt] = useState('10');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qBusy, setQBusy] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);

  async function fetchQuote() {
    if (!act) return;
    const amt = parseFloat(payAmt);
    if (!amt || amt <= 0) { setQErr('Enter an amount.'); return; }
    setQBusy(true); setQErr(null); setQuote(null);
    const q = await getQuote(act.mint, amt, act.decimals, act.symbol);
    if (!q) setQErr('No route available for this token.');
    setQuote(q);
    setQBusy(false);
  }

  async function walletPress() {
    setWBusy(true);
    try {
      if (account) await disconnect();
      else await connect();
    } catch (e) {
      console.log('wallet error', e);
    }
    setWBusy(false);
  }

  async function analyze(mint: string) {
    setEvBusy(true);
    setEv(null);
    setAct(null);
    setEvErr(null);
    setOpenExp(false);
    const [e, a] = await Promise.all([getEvidence(mint), getActivity(mint)]);
    if (!e && !a) setEvErr('No market data available for this token.');
    setEv(e);
    setAct(a);
    setEvBusy(false);
  }

  async function run() {
    setBusy(true);
    setRes(null);
    setEv(null);
    setAct(null);
    setEvErr(null);
    const r = await resolve(input);
    setRes(r);
    setBusy(false);
    if (r.status === 'VERIFIED' && r.candidates[0]) analyze(r.candidates[0].mint);
  }

  const statusColor =
    res?.status === 'VERIFIED' ? '#22c55e' : res?.status === 'AMBIGUOUS' ? '#fbbf24' : '#ef4444';

  return (
    <ScrollView style={s.root} contentContainerStyle={{ padding: 16, paddingTop: 60, paddingBottom: 60 }}>
      <Text style={s.brand}>ALPHA</Text>
      <Text style={s.tag}>Alpha never guesses a token. Alpha verifies it.</Text>

      <Pressable style={s.wallet} onPress={walletPress} disabled={wBusy}>
        <Text style={s.walletText}>
          {wBusy ? 'WORKING...' : account ? String(account.address).slice(0, 4) + '...' + String(account.address).slice(-4) : 'CONNECT WALLET'}
        </Text>
      </Pressable>

      <TextInput
        style={s.input}
        placeholder="Paste address, URL, text or $TICKER"
        placeholderTextColor="#4b5563"
        value={input}
        onChangeText={setInput}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable style={s.btn} onPress={run}>
        <Text style={s.btnText}>RESOLVE</Text>
      </Pressable>

      {busy ? <ActivityIndicator style={{ marginTop: 24 }} color="#22c55e" /> : null}
      {evBusy ? <ActivityIndicator style={{ marginTop: 24 }} color="#3b82f6" /> : null}
      {evErr ? <Text style={s.evErr}>{evErr}</Text> : null}

      {act ? (
        <View style={{ marginTop: 24 }}>
          <Text style={s.tokenLine}>{act.symbol ? '$' + act.symbol : act.mint.slice(0, 8)}</Text>
          {act.name ? <Text style={s.tokenName}>{act.name}</Text> : null}

          <View style={s.snapGrid}>
            <View style={s.snapCell}><Text style={s.snapLabel}>PRICE</Text><Text style={s.snapVal}>{fmtMoney(act.snapshot.price)}</Text></View>
            <View style={s.snapCell}><Text style={s.snapLabel}>MCAP</Text><Text style={s.snapVal}>{fmtMoney(act.snapshot.mcap)}</Text></View>
            <View style={s.snapCell}><Text style={s.snapLabel}>FDV</Text><Text style={s.snapVal}>{fmtMoney(act.snapshot.fdv)}</Text></View>
            <View style={s.snapCell}><Text style={s.snapLabel}>LIQUIDITY</Text><Text style={s.snapVal}>{fmtMoney(act.snapshot.liquidity)}</Text></View>
            <View style={s.snapCell}><Text style={s.snapLabel}>HOLDERS</Text><Text style={s.snapVal}>{act.snapshot.holders && !isNaN(act.snapshot.holders) ? Math.round(act.snapshot.holders).toLocaleString() : '--'}</Text></View>
            <View style={s.snapCell}><Text style={s.snapLabel}>AGE</Text><Text style={s.snapVal}>{act.snapshot.ageDays !== undefined ? act.snapshot.ageDays + 'd' : '--'}</Text></View>
          </View>

          <View style={s.tabs}>
            <Pressable onPress={() => setTab('live')} style={[s.tab, tab === 'live' && s.tabOn]}>
              <Text style={[s.tabText, tab === 'live' && s.tabTextOn]}>LIVE ACTIVITY</Text>
            </Pressable>
            <Pressable onPress={() => setTab('profile')} style={[s.tab, tab === 'profile' && s.tabOn]}>
              <Text style={[s.tabText, tab === 'profile' && s.tabTextOn]}>TOKEN PROFILE</Text>
            </Pressable>
          </View>

          {tab === 'live' ? (
            <View>
              <View style={s.tableHead}>
                <Text style={[s.thLabel]}></Text>
                <Text style={s.th}>5M</Text>
                <Text style={s.th}>1H</Text>
                <Text style={s.th}>6H</Text>
                <Text style={s.th}>24H</Text>
              </View>
              {act.rows.map(r => (
                <View key={r.label} style={s.tr}>
                  <Text style={s.tdLabel}>{r.label}</Text>
                  <Text style={[s.td, { color: tint(r.m5) }]}>{r.m5}</Text>
                  <Text style={[s.td, { color: tint(r.h1) }]}>{r.h1}</Text>
                  <Text style={[s.td, { color: tint(r.h6) }]}>{r.h6}</Text>
                  <Text style={[s.td, { color: tint(r.h24) }]}>{r.h24}</Text>
                </View>
              ))}

              {act.metrics.map(m => (
                <View key={m.key} style={s.sigRow}>
                  <View style={s.sigHead}>
                    <Text style={s.sigLabel}>{m.label}</Text>
                    <Text style={[s.sigLevel, { color: av(m.level) }]}>{m.level}</Text>
                  </View>
                  <Text style={[s.sigValue, { color: av(m.level) }]}>{m.value}</Text>
                  <Text style={s.sigDetail}>{m.fact}</Text>
                  {m.reading ? <Text style={s.reading}>{m.reading}</Text> : null}
                </View>
              ))}

              <Pressable style={s.expBtn} onPress={() => setOpenExp(!openExp)}>
                <Text style={s.expBtnText}>ALPHA EXPLANATION {openExp ? '-' : '+'}</Text>
              </Pressable>

              {openExp ? (
                <View>
                  {act.explanation.map((p, i) => (
                    <View key={i} style={s.para}>
                      <Text style={s.paraTitle}>{p.title}</Text>
                      {p.facts.map((f, k) => <Text key={k} style={s.paraFact}>{f}</Text>)}
                      <Text style={s.paraText}>{p.text}</Text>
                    </View>
                  ))}
                  <Text style={s.footNote}>
                    Generated from the values above. Alpha does not predict price.
                  </Text>
                </View>
              ) : null}

              <View style={s.swapBox}>
                <Text style={s.swapHead}>SWAP</Text>
                <Text style={s.swapLabel}>YOU PAY (USDC)</Text>
                <TextInput style={s.swapInput} value={payAmt} onChangeText={setPayAmt} keyboardType='decimal-pad' placeholderTextColor='#4b5563' />
                <Pressable style={s.quoteBtn} onPress={fetchQuote}>
                  <Text style={s.quoteBtnText}>GET QUOTE</Text>
                </Pressable>
                {qBusy ? <ActivityIndicator style={{ marginTop: 12 }} color='#22c55e' /> : null}
                {qErr ? <Text style={s.evErr}>{qErr}</Text> : null}
                {quote ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={s.swapLabel}>YOU RECEIVE</Text>
                    <Text style={s.swapOut}>{fmtAmount(quote.outUi)} {quote.outSymbol ? quote.outSymbol : ''}</Text>
                    <View style={s.qRow}><Text style={s.qKey}>Price impact</Text><Text style={s.qVal}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text></View>
                    <View style={s.qRow}><Text style={s.qKey}>Max slippage</Text><Text style={s.qVal}>{(quote.slippageBps / 100).toFixed(2)}%</Text></View>
                    <View style={s.qRow}><Text style={s.qKey}>Alpha fee ({quote.feeBps} bps)</Text><Text style={s.qVal}>{fmtAmount(quote.feeUi)} {quote.outSymbol ? quote.outSymbol : ''}</Text></View>
                    {account ? (
                      <Pressable style={s.swapBtn} onPress={doSwap} disabled={sBusy}>
                        <Text style={s.swapBtnText}>{sBusy ? 'SIGNING...' : 'SWAP'}</Text>
                      </Pressable>
                    ) : (
                      <Text style={s.footNote}>Connect a wallet to swap.</Text>
                    )}
                    {sErr ? <Text style={s.evErr}>{sErr}</Text> : null}
                    {sig ? <Text style={s.sigOk}>Sent: {sig.slice(0, 20)}...</Text> : null}
                    <Text style={s.footNote}>Fee values come directly from the Jupiter quote.</Text>
                  </View>
                ) : null}
              </View>

              <Text style={s.footNote}>
                {act.knownCount}/{act.totalCount} metrics available · source: Jupiter
              </Text>
            </View>
          ) : null}

          {tab === 'profile' && ev ? (
            <View>
              <Text style={[s.status, { color: riskColor(ev.risk), borderColor: riskColor(ev.risk) }]}>
                {ev.risk === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT EVIDENCE' : 'PROFILE: ' + ev.risk}
              </Text>
              <Text style={s.meta}>EVIDENCE QUALITY {ev.verifiedCount}/{ev.totalCount} SIGNALS VERIFIED</Text>
              {ev.signals.map(sig => (
                <View key={sig.key} style={s.sigRow}>
                  <View style={s.sigHead}>
                    <Text style={s.sigLabel}>{sig.label}</Text>
                    <Text style={[s.sigLevel, { color: lv(sig.level) }]}>{sig.level}</Text>
                  </View>
                  <Text style={s.sigValue}>{sig.value}</Text>
                  <Text style={s.sigDetail}>{sig.detail}</Text>
                  <View style={s.sigFoot}>
                    <Text style={s.sigSource}>source: {sig.source}</Text>
                    {sig.nearEdge ? <Text style={s.sigEdge}>near threshold</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {res ? (
        <View style={{ marginTop: 28 }}>
          <Text style={[s.status, { color: statusColor, borderColor: statusColor }]}>{res.status}</Text>
          <Text style={s.meta}>INPUT TYPE: {res.kind}</Text>
          {res.note ? <Text style={[s.note, { color: statusColor }]}>{res.note}</Text> : null}

          {res.candidates.map((c, i) => (
            <View key={i} style={s.card}>
              <Text style={s.sym}>{c.symbol ? '$' + c.symbol : 'UNKNOWN SYMBOL'}</Text>
              {c.verified ? <Text style={s.badge}>VERIFIED BY JUPITER</Text> : <Text style={s.warn}>NOT VERIFIED</Text>}
              {c.name ? <Text style={s.name}>{c.name}</Text> : null}
              <Text style={s.mint}>{c.mint}</Text>
              <Text style={s.src}>via {c.source}</Text>
              <Pressable style={s.analyzeBtn} onPress={() => analyze(c.mint)}>
                <Text style={s.analyzeText}>ANALYZE</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  brand: { color: '#e5e7eb', fontSize: 22, letterSpacing: 6, fontWeight: '700' },
  swapBtn: { backgroundColor: '#22c55e', paddingVertical: 14, marginTop: 16, alignItems: 'center' },
  swapBtnText: { color: '#0a0a0a', fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  sigOk: { color: '#22c55e', fontSize: 11, marginTop: 10 },
  swapBox: { borderWidth: 1, borderColor: '#22c55e', padding: 14, marginTop: 20 },
  swapHead: { color: '#22c55e', fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 12 },
  swapLabel: { color: '#4b5563', fontSize: 9, letterSpacing: 1 },
  swapInput: { borderWidth: 1, borderColor: '#262626', color: '#e5e7eb', padding: 10, fontSize: 18, marginTop: 4 },
  swapOut: { color: '#22c55e', fontSize: 20, fontWeight: '700', marginTop: 4 },
  quoteBtn: { borderWidth: 1, borderColor: '#22c55e', paddingVertical: 10, marginTop: 10, alignItems: 'center' },
  quoteBtnText: { color: '#22c55e', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  qRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  qKey: { color: '#6b7280', fontSize: 11 },
  qVal: { color: '#d1d5db', fontSize: 11 },
  wallet: { borderWidth: 1, borderColor: '#525252', paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start', marginBottom: 20 },
  walletText: { color: '#a3a3a3', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  tag: { color: '#4b5563', fontSize: 11, marginTop: 6, marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#262626', color: '#e5e7eb', padding: 12, minHeight: 90, fontSize: 13, textAlignVertical: 'top' },
  btn: { borderWidth: 1, borderColor: '#22c55e', paddingVertical: 12, marginTop: 12, alignItems: 'center' },
  btnText: { color: '#22c55e', letterSpacing: 2, fontSize: 12, fontWeight: '700' },
  tokenLine: { color: '#e5e7eb', fontSize: 20, fontWeight: '700' },
  tokenName: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  snapGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, borderWidth: 1, borderColor: '#262626' },
  snapCell: { width: '33.33%', padding: 10 },
  snapLabel: { color: '#4b5563', fontSize: 9, letterSpacing: 1 },
  snapVal: { color: '#e5e7eb', fontSize: 13, fontWeight: '600', marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 14 },
  tab: { borderWidth: 1, borderColor: '#262626', paddingVertical: 8, paddingHorizontal: 12, flex: 1, alignItems: 'center' },
  tabOn: { borderColor: '#3b82f6' },
  tabText: { color: '#4b5563', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  tabTextOn: { color: '#3b82f6' },
  tableHead: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#262626' },
  thLabel: { width: 72 },
  th: { flex: 1, color: '#4b5563', fontSize: 9, letterSpacing: 1, textAlign: 'right' },
  tr: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#171717' },
  tdLabel: { width: 72, color: '#9ca3af', fontSize: 11 },
  td: { flex: 1, fontSize: 11, textAlign: 'right' },
  status: { alignSelf: 'flex-start', borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12, fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  meta: { color: '#6b7280', fontSize: 10, letterSpacing: 1, marginTop: 10 },
  note: { fontSize: 12, marginTop: 8 },
  evErr: { color: '#ef4444', fontSize: 12, marginTop: 20 },
  footNote: { color: '#374151', fontSize: 9, marginTop: 12 },
  reading: { color: '#9ca3af', fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  expBtn: { borderWidth: 1, borderColor: '#8b5cf6', paddingVertical: 10, marginTop: 16, alignItems: 'center' },
  expBtnText: { color: '#8b5cf6', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  para: { borderLeftWidth: 2, borderLeftColor: '#8b5cf6', paddingLeft: 12, marginTop: 14 },
  paraTitle: { color: '#e5e7eb', fontSize: 13, fontWeight: '700' },
  paraFact: { color: '#6b7280', fontSize: 11, marginTop: 3 },
  paraText: { color: '#d1d5db', fontSize: 12, marginTop: 6, lineHeight: 17 },
  card: { borderWidth: 1, borderColor: '#262626', padding: 12, marginTop: 12 },
  sym: { color: '#e5e7eb', fontSize: 16, fontWeight: '700' },
  badge: { color: '#22c55e', fontSize: 10, letterSpacing: 1, marginTop: 4 },
  warn: { color: '#ef4444', fontSize: 10, letterSpacing: 1, marginTop: 4 },
  name: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
  mint: { color: '#6b7280', fontSize: 10, marginTop: 8 },
  src: { color: '#4b5563', fontSize: 10, marginTop: 4 },
  analyzeBtn: { borderWidth: 1, borderColor: '#3b82f6', paddingVertical: 8, marginTop: 10, alignItems: 'center' },
  analyzeText: { color: '#3b82f6', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  sigRow: { borderWidth: 1, borderColor: '#262626', padding: 12, marginTop: 10 },
  sigHead: { flexDirection: 'row', justifyContent: 'space-between' },
  sigLabel: { color: '#e5e7eb', fontSize: 13, fontWeight: '600' },
  sigLevel: { fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  sigValue: { color: '#9ca3af', fontSize: 14, marginTop: 6, fontWeight: '600' },
  sigDetail: { color: '#4b5563', fontSize: 11, marginTop: 4 },
  sigFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sigSource: { color: '#374151', fontSize: 9 },
  sigEdge: { color: '#78716c', fontSize: 9 },
});




