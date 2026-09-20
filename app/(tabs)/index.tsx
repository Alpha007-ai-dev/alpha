import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { resolve, Result } from '../../lib/resolver';
import { getEvidence, Evidence } from '../../lib/evidence';
import { getActivity, Activity } from '../../lib/activity';
import { computeMarketState } from '../../lib/marketState';
import { getCreatorInfo, CreatorInfo } from '../../lib/dev';
import { C, F } from '../../lib/theme';
import { getFlow, Flow, flowMoney } from '../../lib/flow';
import { getPool } from '../../lib/chart';
import { fetchCandles, ChartResult, ChartTf } from '../../lib/chart';
import CandleChart from '../../components/CandleChart';
import { logObservation, resolveOutcomes, journalStats, exportJournal, recordDecision } from '../../lib/journal';
import { collectCandidates, candidateStats, exportCandidates } from '../../lib/candidates';
import { useMobileWallet } from '@wallet-ui/react-native-kit';
import { getQuote, Quote, fmtAmount, buildSwapTx, decodeTx, PAY_TOKENS, PayToken } from '../../lib/swap';

const lv = (l: string) => (l === 'HIGH' ? '#ef4444' : l === 'MEDIUM' ? '#fbbf24' : l === 'LOW' ? '#22c55e' : '#6b7280');
const av = (l: string) => (l === 'SHARP' ? '#ef4444' : l === 'NOTABLE' ? '#fbbf24' : l === 'CALM' ? '#22c55e' : '#6b7280');
const riskColor = (r: string) => (r === 'HIGH' ? '#ef4444' : r === 'MEDIUM' ? '#fbbf24' : r === 'LOW' ? '#22c55e' : '#6b7280');
const tint = (t: string) => (t.startsWith('-') ? '#ef4444' : t.startsWith('+') ? '#22c55e' : '#6b7280');

const fmtMoney = (v?: number) => {
  if (v === undefined || isNaN(v) || v <= 0) return '--';
  return v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B'
    : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M'
    : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K'
    : '$' + v.toFixed(v < 1 ? 6 : 2);
};

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
  const [msOpen, setMsOpen] = useState(false);
  const [jStats, setJStats] = useState({ total: 0, resolved: 0, complete: 0, pending: 0 });
  const [jText, setJText] = useState<string | null>(null);
  const [cStats, setCStats] = useState({ total: 0 });
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [chartTf, setChartTf] = useState<ChartTf>('1H');
  const [chart, setChart] = useState<ChartResult | null>(null);
  const [chartBusy, setChartBusy] = useState(false);
  const [flow, setFlow] = useState<(Flow & { mint: string }) | null>(null);
  useEffect(() => {
    if (!act) return;
    let alive = true;
    const sn: any = act.snapshot;
    getPool(act.mint)
      .then(p => getFlow(act.mint, p.pool, sn.dev))
      .then(f => { if (alive) setFlow({ ...f, mint: act.mint }); });
    return () => { alive = false; };
  }, [act?.mint, loadedAt]);
  const [decision, setDecision] = useState<{ mint: string; d: string } | null>(null);
  const [dBusy, setDBusy] = useState(false);
  const [creator, setCreator] = useState<(CreatorInfo & { mint: string }) | null>(null);
  useEffect(() => {
    if (!act) return;
    let alive = true;
    const sn: any = act.snapshot;
    getCreatorInfo(act.mint, sn.dev, sn.devBalancePct, sn.totalSupply, sn.devMints)
      .then(r => { if (alive) setCreator({ ...r, mint: act.mint }); });
    return () => { alive = false; };
  }, [act?.mint, loadedAt]);
  const decide = async (d: 'BUY_DEMO' | 'PASS') => {
    if (!act) return;
    setDBusy(true);
    const r = await recordDecision(act, d);
    setDecision({ mint: act.mint, d: r });
    setJStats(await journalStats());
    setDBusy(false);
  };
  useEffect(() => {
    if (!act) return;
    let alive = true;
    setChartBusy(true);
    fetchCandles(act.mint, chartTf)
      .then(r => { if (alive) setChart(r); })
      .finally(() => { if (alive) setChartBusy(false); });
    return () => { alive = false; };
  }, [act?.mint, chartTf, loadedAt]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const { account, connect, disconnect, signAndSendTransaction } = useMobileWallet();
  const [wBusy, setWBusy] = useState(false);
  const [payAmt, setPayAmt] = useState('1');
  const [pay, setPay] = useState<PayToken>(PAY_TOKENS[0]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qBusy, setQBusy] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);
  const [sBusy, setSBusy] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [sErr, setSErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [openEv, setOpenEv] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      await resolveOutcomes();
      setJStats(await journalStats());
      await collectCandidates();
      setCStats(await candidateStats());
    })();
  }, []);

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

  async function fetchQuote() {
    if (!act) return;
    const amt = parseFloat(payAmt);
    if (!amt || amt <= 0) { setQErr('Enter an amount.'); return; }
    setQBusy(true); setQErr(null); setQuote(null);
    const q = await getQuote(pay, amt, act.mint, act.decimals, act.symbol);
    if (!q) setQErr('No route available for this token.');
    setQuote(q);
    setQBusy(false);
  }

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

  async function analyze(mint: string) {
    setEvBusy(true); setEv(null); setAct(null); setEvErr(null); setOpenExp(false);
    setQuote(null); setSig(null); setSErr(null); setConfirming(false); setOpenEv({});
    const [e, a] = await Promise.all([getEvidence(mint), getActivity(mint)]);
    if (!e && !a) setEvErr('No market data available for this token.');
    setEv(e); setAct(a); setEvBusy(false);
    setLoadedAt(Date.now());
    if (a) { await logObservation(a); setJStats(await journalStats()); }
  }

  async function run() {
    setBusy(true); setRes(null); setEv(null); setAct(null); setEvErr(null);
    const r = await resolve(input);
    setRes(r); setBusy(false);
    if (r.status === 'VERIFIED' && r.candidates[0]) analyze(r.candidates[0].mint);
  }

  const statusColor = res?.status === 'VERIFIED' ? '#22c55e' : res?.status === 'AMBIGUOUS' ? '#fbbf24' : '#ef4444';

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
            <View style={s.snapCell}><Text style={s.snapLabel}>AGE</Text><Text style={s.snapVal}>{act.snapshot.ageMinutes !== undefined && act.snapshot.ageMinutes < 1440 ? act.snapshot.ageMinutes + 'm' : act.snapshot.ageDays !== undefined ? act.snapshot.ageDays + 'd' : '--'}</Text></View>
          </View>

          {(() => {
            const cv = chart && chart.mint === act.mint && chart.tf === chartTf ? chart : null;
            return (
              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {(['1H', '6H', '24H'] as ChartTf[]).map(tf => (
                    <Pressable key={tf} onPress={() => setChartTf(tf)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: chartTf === tf ? '#22c55e' : '#374151' }}>
                      <Text style={{ color: chartTf === tf ? '#22c55e' : '#9ca3af', fontSize: 12 }}>{tf}</Text>
                    </Pressable>
                  ))}
                </View>
                {cv && cv.status === 'OK' ? (
                  <CandleChart candles={cv.candles} height={180} />
                ) : chartBusy ? (
                  <View style={{ height: 180, justifyContent: 'center' }}><ActivityIndicator /></View>
                ) : (
                  <Text style={s.youngNote}>{!cv ? '' : cv.status === 'NO_POOL' ? 'Chart not available for this token yet.' : cv.status === 'RATE_LIMIT' ? 'Chart source is busy. Try REFRESH in a minute.' : 'Chart could not be loaded.'}</Text>
                )}
                {cv && cv.status === 'OK' ? (
                  <Text style={{ color: C.sub, fontSize: 10, marginTop: 4 }}>{'Price range ' + chartTf + ' | GeckoTerminal | ' + (cv.dex ?? 'pool') + ' | ' + cv.candles.length + ' candles'}</Text>
                ) : null}
              </View>
            );
          })()}
          <View style={s.freshRow}>
            <Text style={s.freshText}>
              {loadedAt ? 'UPDATED ' + (Math.floor((nowTick - loadedAt) / 1000) < 10 ? 'JUST NOW' : Math.floor((nowTick - loadedAt) / 1000) < 60 ? Math.floor((nowTick - loadedAt) / 1000) + 'S AGO' : Math.floor((nowTick - loadedAt) / 60000) + 'M AGO') : ''}
            </Text>
            <Pressable onPress={() => analyze(act.mint)} disabled={evBusy}>
              <Text style={s.refreshBtn}>{evBusy ? 'UPDATING...' : 'REFRESH'}</Text>
            </Pressable>
          </View>
          {act.youngNote ? <Text style={s.youngNote}>{act.youngNote}</Text> : null}
          {(() => {
            const sn: any = act.snapshot;
            const chips: { t: string; on?: boolean }[] = [];
            if (sn.launchpad) chips.push({ t: sn.launchpad });
            if (sn.graduatedAt && sn.launchedAt) {
              const m = Math.round((new Date(sn.graduatedAt).getTime() - new Date(sn.launchedAt).getTime()) / 60000);
              chips.push({ t: 'Graduated in ' + (m < 120 ? m + ' min' : Math.round(m / 60) + ' h'), on: true });
            } else if (sn.launchpad) {
              chips.push({ t: 'Not graduated' });
            }
            if (sn.devMints === 1) chips.push({ t: 'New creator', on: true });
            else if (sn.devMints > 1) chips.push({ t: sn.devMints + ' tokens by creator' });
            const am = sn.ageMinutes;
            if (am !== undefined) chips.push({ t: am < 60 ? am + ' min old' : am < 1440 ? Math.floor(am / 60) + 'h old' : Math.floor(am / 1440) + 'd old' });
            if (!chips.length) return null;
            return (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {chips.map(c => (
                  <View key={c.t} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: c.on ? C.green : C.border, backgroundColor: c.on ? C.greenBg : C.card }}>
                    <Text style={{ color: c.on ? C.green : C.text, fontSize: 11, fontFamily: F.mono }}>{c.t}</Text>
                  </View>
                ))}
              </View>
            );
          })()}
          {act.evidence ? (
            <View style={s.snapGrid}>
              <View style={s.snapCell}><Text style={s.snapLabel}>{'HOLDERS ' + act.evidence.window.toUpperCase()}</Text><Text style={s.snapVal}>{act.evidence.holdersChg !== undefined ? (act.evidence.holdersChg >= 0 ? '+' : '') + act.evidence.holdersChg.toFixed(1) + '%' : '--'}</Text></View>
              <View style={s.snapCell}><Text style={s.snapLabel}>AVG BUY / SELL</Text><Text style={s.snapVal}>{fmtMoney(act.evidence.avgBuy) + ' / ' + fmtMoney(act.evidence.avgSell)}</Text></View>
              <View style={s.snapCell}><Text style={s.snapLabel}>TRADES / TRADER</Text><Text style={s.snapVal}>{act.evidence.tradesPerTrader !== undefined ? act.evidence.tradesPerTrader.toFixed(2) : '--'}</Text></View>
              <View style={s.snapCell}><Text style={s.snapLabel}>ORGANIC (JUPITER)</Text><Text style={s.snapVal}>{act.evidence.organicPct !== undefined ? act.evidence.organicPct.toFixed(1) + '%' : '--'}</Text></View>
            </View>
          ) : null}

          {(() => {
            const fl = flow && flow.mint === act.mint ? flow : null;
            if (!fl) return null;
            if (fl.status !== 'OK') return (
              <View style={{ marginTop: 16, padding: 14, borderWidth: 1, borderColor: C.border, borderRadius: 14 }}>
                <Text style={s.snapLabel}>RIGHT NOW</Text>
                <Text style={{ color: C.sub, fontSize: 12, marginTop: 6, fontFamily: F.mono }}>{fl.status === 'NO_POOL' ? 'No trade data for this token yet.' : fl.status === 'RATE_LIMIT' ? 'Trade source is busy. Try REFRESH in a minute.' : 'Trade data could not be loaded.'}</Text>
              </View>
            );
            const col = fl.key === 'BUYING_MOMENTUM' ? C.green : fl.key === 'SELLING_PRESSURE' || fl.key === 'CREATOR_SELLING' ? C.red : fl.key === 'FEW_WALLETS' || fl.key === 'FAST_IN_AND_OUT' ? C.amber : C.text;
            const row = (k: string, v: string, c?: string) => (
              <View key={k} style={{ flexDirection: 'row', marginTop: 8 }}>
                <Text style={[s.snapLabel, { width: 62, paddingTop: 2 }]}>{k}</Text>
                <Text style={{ flex: 1, color: c ?? C.text, fontSize: 12, lineHeight: 18, fontFamily: F.mono }}>{v}</Text>
              </View>
            );
            const sold = fl.creatorTrades.filter(x => x.kind === 'sell');
            const creatorLine = sold.length
              ? 'Sold ' + flowMoney(sold.reduce((x, y) => x + y.usd, 0)) + ' in this window.'
              : fl.creatorTrades.length ? 'Bought in this window.' : 'No trades in this window.';
            return (
              <View style={{ marginTop: 16, padding: 14, borderWidth: 1, borderColor: C.border2, borderRadius: 14, backgroundColor: C.card }}>
                <Text style={s.snapLabel}>{'RIGHT NOW · ' + fl.windowLabel}</Text>
                <Text style={{ color: col, fontSize: 24, fontFamily: F.head, marginTop: 6 }}>{fl.label}</Text>
                <Text style={{ color: C.sub, fontSize: 12, marginTop: 4, fontFamily: F.mono }}>{fl.support}</Text>
                {row('PACE', fl.trades + ' trades in ' + fl.minutes + ' min.')}
                {row('WHO', fl.buyWallets + ' wallets bought ' + flowMoney(fl.buyUsd) + ' · ' + fl.sellWallets + ' sold ' + flowMoney(fl.sellUsd) + '. ' + fl.bothWallets + ' did both.')}
                {row('CREATOR', creatorLine, sold.length ? C.red : C.green)}
                {fl.repeatAmount || fl.dustPct >= 25 ? (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
                    <Text style={s.snapLabel}>TRADE PATTERNS</Text>
                    {fl.repeatAmount ? <Text style={{ color: C.text, fontSize: 12, marginTop: 6, lineHeight: 18, fontFamily: F.mono }}>{fl.repeatAmount.count + ' trades of exactly $' + fl.repeatAmount.usd.toFixed(2) + '.'}</Text> : null}
                    {fl.dustPct >= 25 ? <Text style={{ color: C.text, fontSize: 12, marginTop: 4, lineHeight: 18, fontFamily: F.mono }}>{Math.round(fl.dustPct) + '% of trades were under $5.'}</Text> : null}
                    <Text style={{ color: C.muted, fontSize: 10, marginTop: 6, lineHeight: 15, fontFamily: F.mono }}>Repeated identical amounts and fast in-and-out trading are common patterns of automated trading. They are not proof of it.</Text>
                  </View>
                ) : null}
                <Text style={{ color: C.muted, fontSize: 10, marginTop: 10, fontFamily: F.mono }}>Source: GeckoTerminal trades. Not financial advice.</Text>
              </View>
            );
          })()}
          {(() => {
            const cr = creator && creator.mint === act.mint ? creator : null;
            if (!cr) return null;
            const fp = (v?: number) => (v === undefined || isNaN(v) ? 'UNKNOWN' : v < 0.01 ? '<0.01%' : v.toFixed(2) + '%');
            const hm = (ms?: number) => { if (!ms) return ''; const d = new Date(ms); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); };
            const has = cr.pct !== undefined && cr.basePct !== undefined;
            const delta = has ? (cr.pct as number) - (cr.basePct as number) : 0;
            const change = !cr.since ? 'First check. Changes appear on your next visit.'
              : !has ? 'No earlier balance to compare.'
              : Math.abs(delta) < 0.01 ? 'Unchanged since ' + hm(cr.since) + '.'
              : 'Creator wallet balance ' + (delta < 0 ? 'fell' : 'rose') + ' from ' + fp(cr.basePct) + ' to ' + fp(cr.pct) + ' since ' + hm(cr.since) + '.';
            const deployer = cr.mints === 1 ? 'NEW CREATOR: first token from this wallet.'
              : cr.newMints && cr.newMints > 0 ? 'Deployer launched ' + cr.newMints + ' new token(s) since ' + hm(cr.since) + '.'
              : cr.mints !== undefined ? 'Deployer has launched ' + cr.mints + ' tokens.' : '';
            return (
              <View style={{ marginTop: 16, padding: 14, borderWidth: 1, borderColor: '#374151', borderRadius: 10 }}>
                <Text style={s.snapLabel}>CREATOR WALLET</Text>
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 6 }}>{fp(cr.pct) + (cr.source === 'CHAIN' ? '  (read on-chain)' : cr.source === 'JUPITER' ? '  (via Jupiter)' : '')}</Text>
                <Text style={{ color: C.text, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{change}</Text>
                {has && delta <= -0.01 ? <Text style={{ color: C.amber, fontSize: 12, lineHeight: 18, marginTop: 6 }}>WHAT TO WATCH: whether the balance keeps falling, and whether liquidity drops at the same time.</Text> : null}
                {deployer ? <Text style={{ color: C.sub, fontSize: 12, lineHeight: 18, marginTop: 6 }}>{deployer}</Text> : null}
                <Text style={{ color: C.sub, fontSize: 10, marginTop: 6 }}>Tracks the deployer wallet only. A lower balance is not proof of a sale.</Text>
              </View>
            );
          })()}
          {(() => {
            const dNow = decision && decision.mint === act.mint ? decision.d : null;
            return (
              <View style={{ marginTop: 16, padding: 14, borderWidth: 1, borderColor: '#374151', borderRadius: 10 }}>
                <Text style={s.snapLabel}>YOUR DECISION</Text>
                {dNow ? (
                  <Text style={{ color: C.text, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{dNow === 'ERROR' ? 'Could not save the decision. Try again.' : 'Saved: ' + (dNow === 'BUY_DEMO' ? 'BUY DEMO' : 'PASS') + '. Alpha measures what happens next at 1h, 6h and 24h.'}</Text>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable disabled={dBusy} onPress={() => decide('BUY_DEMO')} style={{ flex: 1, height: 48, borderRadius: 8, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#052e16', fontWeight: '700', fontSize: 13 }}>BUY DEMO</Text>
                    </Pressable>
                    <Pressable disabled={dBusy} onPress={() => decide('PASS')} style={{ flex: 1, height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#4b5563', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>PASS</Text>
                    </Pressable>
                  </View>
                )}
                <Text style={{ color: C.sub, fontSize: 10, marginTop: 8 }}>Demo only. No funds move. Not financial advice.</Text>
              </View>
            );
          })()}
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
                <Text style={s.thLabel}></Text>
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
                  {m.reading ? <Text style={s.reading}>{m.reading}</Text> : null}
                  <Pressable onPress={() => setOpenEv({ ...openEv, [m.key]: !openEv[m.key] })}>
                    <Text style={s.evToggle}>{openEv[m.key] ? 'HIDE EVIDENCE' : 'SHOW EVIDENCE'}</Text>
                  </Pressable>
                  {openEv[m.key] ? (
                    <View style={s.evBox}>
                      <Text style={s.evFact}>{m.fact}</Text>
                      <Text style={s.evSrc}>source: Jupiter</Text>
                    </View>
                  ) : null}
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
                  <Text style={s.footNote}>Generated from the values above. Alpha does not predict price.</Text>
                </View>
              ) : null}

              <View style={s.swapBox}>
                <Text style={s.swapHead}>SWAP</Text>
                <Text style={s.swapLabel}>PAY WITH</Text>
                <View style={s.payRow}>
                  {PAY_TOKENS.map(t => (
                    <Pressable key={t.key} onPress={() => { setPay(t); setQuote(null); }} style={[s.payBtn, pay.key === t.key && s.payBtnOn]}>
                      <Text style={[s.payBtnText, pay.key === t.key && s.payBtnTextOn]}>{t.symbol}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.swapLabel}>YOU PAY ({pay.symbol})</Text>
                <TextInput style={s.swapInput} value={payAmt} onChangeText={setPayAmt} keyboardType="decimal-pad" placeholderTextColor="#4b5563" />
                <Pressable style={s.quoteBtn} onPress={fetchQuote}>
                  <Text style={s.quoteBtnText}>GET QUOTE</Text>
                </Pressable>
                {qBusy ? <ActivityIndicator style={{ marginTop: 12 }} color="#22c55e" /> : null}
                {qErr ? <Text style={s.evErr}>{qErr}</Text> : null}
                {quote ? (
                  <View style={{ marginTop: 14 }}>
                    <Text style={s.swapLabel}>YOU RECEIVE</Text>
                    <Text style={s.swapOut}>{fmtAmount(quote.outUi)} {quote.outSymbol ?? ''}</Text>
                    <View style={s.qRow}><Text style={s.qKey}>Price impact</Text><Text style={s.qVal}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text></View>
                    <View style={s.qRow}><Text style={s.qKey}>Max slippage</Text><Text style={s.qVal}>{(quote.slippageBps / 100).toFixed(2)}%</Text></View>
                    <View style={s.qRow}><Text style={s.qKey}>Alpha fee{quote.feeBps ? ' (' + quote.feeBps + ' bps)' : ''}</Text><Text style={s.qVal}>{quote.feeBps ? fmtAmount(quote.feeUi) + ' ' + quote.feeSymbol : 'none'}</Text></View>
                    {account ? (confirming ? (
                      <View style={s.confirmBox}>
                        <Text style={s.confirmHead}>BEFORE YOU SIGN</Text>
                        <Text style={s.confirmBuy}>You are buying {fmtAmount(quote.outUi)} {quote.outSymbol ?? ''}</Text>
                        <Text style={s.confirmPay}>for {payAmt} {pay.symbol}</Text>
                        <Text style={s.confirmSub}>CURRENT ACTIVITY</Text>
                        {act.metrics.map(m => (
                          <View key={m.key} style={s.confirmRow}>
                            <Text style={s.confirmKey}>{m.label}</Text>
                            <Text style={[s.confirmVal, { color: av(m.level) }]}>{m.level}</Text>
                          </View>
                        ))}
                        {ev ? (
                          <View style={s.confirmRow}>
                            <Text style={s.confirmKey}>Token profile</Text>
                            <Text style={[s.confirmVal, { color: riskColor(ev.risk) }]}>{ev.risk === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT' : ev.risk}</Text>
                          </View>
                        ) : null}
                        <Pressable style={s.swapBtn} onPress={doSwap} disabled={sBusy}>
                          <Text style={s.swapBtnText}>{sBusy ? 'SIGNING...' : 'CONTINUE TO WALLET'}</Text>
                        </Pressable>
                        <Pressable onPress={() => setConfirming(false)}>
                          <Text style={s.cancelText}>CANCEL</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable style={s.swapBtn} onPress={() => setConfirming(true)}>
                        <Text style={s.swapBtnText}>SWAP</Text>
                      </Pressable>
                    )) : (
                      <Text style={s.footNote}>Connect a wallet to swap.</Text>
                    )}

                    {sErr ? <Text style={s.evErr}>{sErr}</Text> : null}
                    {sig ? <Text style={s.sigOk}>Sent: {sig.slice(0, 20)}...</Text> : null}
                    <Text style={s.footNote}>Fee values come directly from the Jupiter quote.</Text>
                  </View>
                ) : null}
              </View>

              <Text style={s.footNote}>{act.knownCount}/{act.totalCount} metrics available · source: Jupiter</Text>
            </View>
          ) : null}

          {tab === 'profile' && ev ? (
            <View>
              <Text style={[s.status, { color: riskColor(ev.risk), borderColor: riskColor(ev.risk) }]}>
                {ev.risk === 'INSUFFICIENT_EVIDENCE' ? 'INSUFFICIENT EVIDENCE' : 'PROFILE: ' + ev.risk}
              </Text>
              <Text style={s.meta}>EVIDENCE QUALITY {ev.verifiedCount}/{ev.totalCount} SIGNALS VERIFIED</Text>
              {ev.signals.map(sig2 => (
                <View key={sig2.key} style={s.sigRow}>
                  <View style={s.sigHead}>
                    <Text style={s.sigLabel}>{sig2.label}</Text>
                    <Text style={[s.sigLevel, { color: lv(sig2.level) }]}>{sig2.level}</Text>
                  </View>
                  <Text style={s.sigValue}>{sig2.value}</Text>
                  <Text style={s.sigDetail}>{sig2.detail}</Text>
                  <View style={s.sigFoot}>
                    <Text style={s.sigSource}>source: {sig2.source}</Text>
                    {sig2.nearEdge ? <Text style={s.sigEdge}>near threshold</Text> : null}
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

      <View style={s.jRow}>
        <Text style={s.jText}>JOURNAL {jStats.total} obs · {jStats.resolved} tracked · {jStats.complete} at 24h · {cStats.total} candidates</Text>
        <Pressable onPress={async () => setJText(await exportJournal())}>
          <Text style={s.jExport}>EXPORT</Text>
        </Pressable>
      </View>
      {jText ? <Text selectable style={s.jDump}>{jText}</Text> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  brand: { color: C.text, fontSize: 22, letterSpacing: 6, fontFamily: F.head },
  tag: { color: C.muted, fontSize: 11, marginTop: 6, marginBottom: 16 },
  wallet: { borderWidth: 1, borderColor: C.border2, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start', marginBottom: 20 },
  walletText: { color: '#a3a3a3', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: C.border, color: C.text, padding: 12, minHeight: 90, fontSize: 13, textAlignVertical: 'top' },
  btn: { borderWidth: 1, borderColor: C.green, paddingVertical: 12, marginTop: 12, alignItems: 'center' },
  btnText: { color: C.green, letterSpacing: 2, fontSize: 12, fontWeight: '700' },
  tokenLine: { color: C.text, fontSize: 22, fontFamily: F.head },
  tokenName: { color: C.sub, fontSize: 12, marginTop: 2 },
  freshRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  freshText: { color: C.muted, fontSize: 9, letterSpacing: 1 },
  refreshBtn: { color: C.green, fontSize: 10, letterSpacing: 1, fontWeight: '700', borderWidth: 1, borderColor: C.green, paddingVertical: 5, paddingHorizontal: 12 },
  youngNote: { color: C.amber, fontSize: 10, marginTop: 10, lineHeight: 15 },
  snapGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', backgroundColor: C.card2 },
  snapCell: { width: '33.33%', padding: 10 },
  snapLabel: { color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono },
  snapVal: { color: C.text, fontSize: 14, fontFamily: F.monoMed, marginTop: 3 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 14 },
  tab: { borderWidth: 1, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 12, flex: 1, alignItems: 'center' },
  tabOn: { borderColor: C.green },
  tabText: { color: C.muted, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  tabTextOn: { color: C.green },
  tableHead: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  thLabel: { width: 72 },
  th: { flex: 1, color: C.muted, fontSize: 9, letterSpacing: 1, textAlign: 'right' },
  tr: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  tdLabel: { width: 72, color: C.sub, fontSize: 11 },
  td: { flex: 1, fontSize: 11, textAlign: 'right' },
  status: { alignSelf: 'flex-start', borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12, fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  meta: { color: C.sub, fontSize: 10, letterSpacing: 1, marginTop: 10 },
  note: { fontSize: 12, marginTop: 8 },
  evErr: { color: C.red, fontSize: 12, marginTop: 12 },
  footNote: { color: C.muted, fontSize: 9, marginTop: 12 },
  reading: { color: C.sub, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  expBtn: { borderWidth: 1, borderColor: C.amber, paddingVertical: 10, marginTop: 16, alignItems: 'center' },
  expBtnText: { color: C.amber, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  para: { borderLeftWidth: 2, borderLeftColor: C.amber, paddingLeft: 12, marginTop: 14 },
  paraTitle: { color: C.text, fontSize: 13, fontWeight: '700' },
  paraFact: { color: C.sub, fontSize: 11, marginTop: 3 },
  paraText: { color: C.text, fontSize: 12, marginTop: 6, lineHeight: 17 },
  swapBox: { borderWidth: 1, borderColor: C.green, padding: 14, marginTop: 20 },
  swapHead: { color: C.green, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 12 },
  swapLabel: { color: C.muted, fontSize: 9, letterSpacing: 1 },
  swapInput: { borderWidth: 1, borderColor: C.border, color: C.text, padding: 10, fontSize: 18, marginTop: 4 },
  swapOut: { color: C.green, fontSize: 20, fontWeight: '700', marginTop: 4 },
  quoteBtn: { borderWidth: 1, borderColor: C.green, paddingVertical: 10, marginTop: 10, alignItems: 'center' },
  quoteBtnText: { color: C.green, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  qRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  qKey: { color: C.sub, fontSize: 11 },
  qVal: { color: C.text, fontSize: 11 },
  payRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 12 },
  payBtn: { borderWidth: 1, borderColor: C.border, paddingVertical: 7, paddingHorizontal: 14 },
  payBtnOn: { borderColor: C.green },
  payBtnText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  payBtnTextOn: { color: C.green },
  swapBtn: { backgroundColor: C.green, paddingVertical: 14, marginTop: 16, alignItems: 'center' },
  swapBtnText: { color: C.greenInk, fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  evToggle: { color: C.green, fontSize: 9, letterSpacing: 1, fontWeight: '700', marginTop: 10 },
  evBox: { borderLeftWidth: 2, borderLeftColor: C.green, paddingLeft: 10, marginTop: 8 },
  evFact: { color: C.text, fontSize: 11, lineHeight: 16 },
  evSrc: { color: C.muted, fontSize: 9, marginTop: 4 },
  confirmBox: { borderWidth: 1, borderColor: C.amber, padding: 14, marginTop: 16 },
  confirmHead: { color: C.amber, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  confirmBuy: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 10 },
  confirmPay: { color: C.sub, fontSize: 12, marginTop: 2 },
  confirmSub: { color: C.muted, fontSize: 9, letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  confirmKey: { color: C.sub, fontSize: 11 },
  confirmVal: { fontSize: 11, fontWeight: '700' },
  cancelText: { color: C.sub, fontSize: 10, letterSpacing: 1, textAlign: 'center', marginTop: 12 },
  sigOk: { color: C.green, fontSize: 11, marginTop: 10 },
  card: { borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 12 },
  sym: { color: C.text, fontSize: 16, fontWeight: '700' },
  badge: { color: C.green, fontSize: 10, letterSpacing: 1, marginTop: 4 },
  warn: { color: C.red, fontSize: 10, letterSpacing: 1, marginTop: 4 },
  name: { color: C.sub, fontSize: 12, marginTop: 4 },
  mint: { color: C.sub, fontSize: 10, marginTop: 8 },
  src: { color: C.muted, fontSize: 10, marginTop: 4 },
  analyzeBtn: { borderWidth: 1, borderColor: C.green, paddingVertical: 8, marginTop: 10, alignItems: 'center' },
  analyzeText: { color: C.green, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  sigRow: { borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 10 },
  sigHead: { flexDirection: 'row', justifyContent: 'space-between' },
  sigLabel: { color: C.text, fontSize: 13, fontFamily: F.monoMed },
  sigLevel: { fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  sigValue: { color: C.text, fontSize: 15, marginTop: 6, fontFamily: F.monoMed },
  sigDetail: { color: C.muted, fontSize: 11, marginTop: 4 },
  sigFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sigSource: { color: C.muted, fontSize: 9 },
  sigEdge: { color: '#78716c', fontSize: 9 },
  jRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, borderTopWidth: 1, borderTopColor: '#1f1f1f', paddingTop: 10 },
  jText: { color: C.muted, fontSize: 9, letterSpacing: 1 },
  jExport: { color: C.sub, fontSize: 9, letterSpacing: 1 },
  jDump: { color: C.sub, fontSize: 8, marginTop: 10 },
});






