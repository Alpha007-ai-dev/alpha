import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { listDemo, closeDemo, livePrices, DemoPos } from '../../lib/demo'
import { getBalances, Balance } from '../../lib/balances'
import { C, F } from '../../lib/theme'

const usd = (v?: number) => (v === undefined || isNaN(v) ? '--' : (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2))
const pct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'

export default function Wallet() {
  const { account, connect, disconnect } = useMobileWallet()
  const [tab, setTab] = useState<'demo' | 'real'>('demo')
  const [pos, setPos] = useState<DemoPos[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [bal, setBal] = useState<{ list: Balance[]; total: number; status: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [wBusy, setWBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    const p = await listDemo()
    setPos(p)
    const open = p.filter(x => !x.closed).map(x => x.mint)
    if (open.length) setPrices(await livePrices(open))
    if (account) setBal(await getBalances(String(account.address)))
    setBusy(false)
  }, [account])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const openPos = pos.filter(p => !p.closed)
  const closedPos = pos.filter(p => p.closed)
  let inv = 0, now = 0
  for (const p of openPos) {
    const pr = prices[p.mint]
    inv += p.usd
    now += pr ? p.qty * pr : p.usd
  }
  const pl = now - inv
  const plPct = inv > 0 ? (pl / inv) * 100 : 0

  const seg = (k: 'demo' | 'real', label: string) => (
    <Pressable onPress={() => setTab(k)} style={{ flex: 1, height: 40, borderRadius: 9, backgroundColor: tab === k ? C.greenBg : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: tab === k ? C.green : C.sub, fontSize: 12, letterSpacing: 1, fontFamily: F.monoBold }}>{label}</Text>
    </Pressable>
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.green} />}>
      <Text style={{ color: C.text, fontSize: 26, fontFamily: F.head }}>Wallet</Text>

      <View style={{ flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginTop: 12 }}>
        {seg('demo', 'DEMO')}
        {seg('real', 'REAL')}
      </View>

      {tab === 'demo' ? (
        <View>
          <View style={{ marginTop: 14, padding: 16, borderRadius: 14, backgroundColor: C.card }}>
            <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono }}>DEMO P&L · OPEN POSITIONS</Text>
            <Text style={{ color: pl >= 0 ? C.green : C.red, fontSize: 30, fontFamily: F.head, marginTop: 6 }}>{usd(pl)}</Text>
            <Text style={{ color: pl >= 0 ? C.green : C.red, fontSize: 13, fontFamily: F.mono }}>{inv > 0 ? pct(plPct) : ''}</Text>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <View style={{ flex: 1 }}><Text style={{ color: C.sub, fontSize: 10, fontFamily: F.mono }}>Invested</Text><Text style={{ color: C.text, fontSize: 14, fontFamily: F.monoMed }}>{usd(inv)}</Text></View>
              <View style={{ flex: 1 }}><Text style={{ color: C.sub, fontSize: 10, fontFamily: F.mono }}>Value now</Text><Text style={{ color: C.text, fontSize: 14, fontFamily: F.monoMed }}>{usd(now)}</Text></View>
              <View style={{ flex: 1 }}><Text style={{ color: C.sub, fontSize: 10, fontFamily: F.mono }}>Open</Text><Text style={{ color: C.text, fontSize: 14, fontFamily: F.monoMed }}>{openPos.length}</Text></View>
            </View>
          </View>

          <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono, marginTop: 18, marginBottom: 8 }}>OPEN DEMO POSITIONS</Text>
          {openPos.length === 0 ? (
            <Text style={{ color: C.sub, fontSize: 12, fontFamily: F.mono }}>No open demo positions. Use BUY DEMO on a token.</Text>
          ) : openPos.map(p => {
            const pr = prices[p.mint]
            const val = pr ? p.qty * pr : undefined
            const d = val !== undefined ? val - p.usd : undefined
            const dp = val !== undefined ? (val / p.usd - 1) * 100 : undefined
            return (
              <View key={p.id} style={{ marginBottom: 8, padding: 14, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 15, fontFamily: F.head }}>{p.symbol ? '$' + p.symbol : p.mint.slice(0, 6)}</Text>
                    {p.flowLabel ? <Text style={{ color: C.muted, fontSize: 9, fontFamily: F.mono, marginTop: 2 }}>{p.flowLabel + ' at entry'}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: d === undefined ? C.sub : d >= 0 ? C.green : C.red, fontSize: 15, fontFamily: F.monoBold }}>{d === undefined ? '--' : usd(d)}</Text>
                    <Text style={{ color: d === undefined ? C.sub : d >= 0 ? C.green : C.red, fontSize: 11, fontFamily: F.mono }}>{dp === undefined ? '' : pct(dp)}</Text>
                  </View>
                </View>
                <Text style={{ color: C.sub, fontSize: 10, fontFamily: F.mono, marginTop: 8 }}>{usd(p.usd) + ' in · entry ' + p.entryPrice.toPrecision(4) + (pr ? ' · now ' + pr.toPrecision(4) : '')}</Text>
                <Pressable onPress={async () => { if (pr) { await closeDemo(p.id, pr); load() } }} style={{ height: 42, borderRadius: 10, borderWidth: 1, borderColor: C.border2, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
                  <Text style={{ color: C.text, fontSize: 11, letterSpacing: 1, fontFamily: F.monoBold }}>CLOSE DEMO</Text>
                </Pressable>
              </View>
            )
          })}

          <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono, marginTop: 18, marginBottom: 8 }}>CLOSED</Text>
          {closedPos.length === 0 ? (
            <Text style={{ color: C.sub, fontSize: 12, fontFamily: F.mono }}>No closed demo trades yet.</Text>
          ) : closedPos.map(p => {
            const d = (p.closed?.usd ?? 0) - p.usd
            return (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Text style={{ color: C.text, fontSize: 13, fontFamily: F.mono }}>{p.symbol ? '$' + p.symbol : p.mint.slice(0, 6)}</Text>
                <Text style={{ color: d >= 0 ? C.green : C.red, fontSize: 13, fontFamily: F.monoMed }}>{usd(d)}</Text>
              </View>
            )
          })}
          <Text style={{ color: C.muted, fontSize: 10, marginTop: 14, fontFamily: F.mono }}>Demo only. No funds move. Live prices from Jupiter.</Text>
        </View>
      ) : (
        <View>
          <View style={{ marginTop: 14, padding: 16, borderRadius: 14, backgroundColor: C.card }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono }}>{account ? 'SEEKER WALLET · CONNECTED' : 'NO WALLET CONNECTED'}</Text>
              <Pressable disabled={wBusy} onPress={async () => { setWBusy(true); try { if (account) await disconnect(); else await connect(); } catch {} setWBusy(false); load() }} style={{ borderWidth: 1, borderColor: C.border2, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
                <Text style={{ color: C.text, fontSize: 10, fontFamily: F.monoBold }}>{wBusy ? '...' : account ? 'DISCONNECT' : 'CONNECT'}</Text>
              </Pressable>
            </View>
            {account ? <Text style={{ color: C.sub, fontSize: 11, fontFamily: F.mono, marginTop: 8 }}>{String(account.address).slice(0, 6) + '...' + String(account.address).slice(-6)}</Text> : null}
            <Text style={{ color: C.text, fontSize: 30, fontFamily: F.head, marginTop: 6 }}>{account ? (bal ? usd(bal.total) : '...') : '--'}</Text>
          </View>

          <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono, marginTop: 18, marginBottom: 8 }}>BALANCES</Text>
          {!account ? (
            <Text style={{ color: C.sub, fontSize: 12, fontFamily: F.mono }}>Connect your wallet to see balances.</Text>
          ) : !bal || bal.status !== 'OK' ? (
            <Text style={{ color: C.sub, fontSize: 12, fontFamily: F.mono }}>{bal ? 'Could not load balances. Pull to refresh.' : 'Loading...'}</Text>
          ) : bal.list.length === 0 ? (
            <Text style={{ color: C.sub, fontSize: 12, fontFamily: F.mono }}>No tokens in this wallet.</Text>
          ) : bal.list.map(b => (
            <View key={b.mint} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ color: C.text, fontSize: 13, fontFamily: F.mono }}>{b.symbol ?? b.mint.slice(0, 6)}</Text>
              <Text style={{ color: C.sub, fontSize: 12, fontFamily: F.mono }}>{b.amount.toPrecision(4) + (b.usd !== undefined ? '  ' + usd(b.usd) : '')}</Text>
            </View>
          ))}

          <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono, marginTop: 18, marginBottom: 8 }}>ALPHA TRADES</Text>
          <View style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' }}>
            <Text style={{ color: C.text, fontSize: 12, fontFamily: F.mono }}>No Alpha trades yet</Text>
            <Text style={{ color: C.sub, fontSize: 11, fontFamily: F.mono, marginTop: 6, lineHeight: 16 }}>Swaps you make through Alpha appear here with entry value and change since your swap.</Text>
          </View>
          <Text style={{ color: C.muted, fontSize: 10, marginTop: 14, lineHeight: 15, fontFamily: F.mono }}>Tracks swaps made in Alpha only. Not financial advice.</Text>
        </View>
      )}
    </ScrollView>
  )
}