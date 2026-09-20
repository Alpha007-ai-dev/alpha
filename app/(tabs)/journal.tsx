import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { listObservations, resolveOutcomes, exportJournal } from '../../lib/journal'
import { C, F } from '../../lib/theme'

const HZ = ['1h', '6h', '24h']

const outColor = (o?: string) =>
  o === 'UP' ? C.green : o === 'DOWN' ? C.red : o === 'STABLE' ? C.text : C.muted

export default function Journal() {
  const [list, setList] = useState<any[]>([])
  const [hz, setHz] = useState('6h')
  const [busy, setBusy] = useState(false)
  const [csv, setCsv] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    await resolveOutcomes()
    setList(await listObservations())
    setBusy(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const counts = { up: 0, down: 0, stable: 0, nodata: 0, pending: 0 }
  for (const o of list) {
    const x = (o.outcomes ?? []).find((y: any) => y.horizon === hz)
    if (!x) counts.pending++
    else if (x.outcome === 'UP') counts.up++
    else if (x.outcome === 'DOWN') counts.down++
    else if (x.outcome === 'STABLE') counts.stable++
    else counts.nodata++
  }
  const valid = counts.up + counts.down + counts.stable

  const cell = (o: any, h: string) => {
    const x = (o.outcomes ?? []).find((y: any) => y.horizon === h)
    const label = !x ? 'PENDING' : x.outcome === 'NO_DATA' || !x.outcome ? 'NO DATA' : x.outcome
    const pct = x && x.priceChangePct !== undefined ? (x.priceChangePct >= 0 ? '+' : '') + x.priceChangePct.toFixed(1) + '%' : ''
    return (
      <View key={h} style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ color: outColor(x?.outcome), fontSize: 10, fontFamily: F.monoMed }}>{label}</Text>
        <Text style={{ color: C.muted, fontSize: 9, fontFamily: F.mono, marginTop: 2 }}>{pct || '—'}</Text>
      </View>
    )
  }

  const num = (v: number, l: string, c: string) => (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: C.card, borderRadius: 10 }}>
      <Text style={{ color: c, fontSize: 19, fontFamily: F.head }}>{v}</Text>
      <Text style={{ color: C.sub, fontSize: 9, fontFamily: F.mono, marginTop: 2 }}>{l}</Text>
    </View>
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.green} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ color: C.text, fontSize: 26, fontFamily: F.head }}>Journal</Text>
          <Text style={{ color: C.sub, fontSize: 10, fontFamily: F.mono, marginTop: 4, letterSpacing: 1 }}>SEE · UNDERSTAND · DECIDE · <Text style={{ color: C.green }}>MEASURE</Text></Text>
        </View>
        <Pressable onPress={async () => setCsv(csv ? null : await exportJournal())} style={{ borderWidth: 1, borderColor: C.border2, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12 }}>
          <Text style={{ color: C.text, fontSize: 10, fontFamily: F.monoBold, letterSpacing: 1 }}>{csv ? 'HIDE CSV' : 'EXPORT CSV'}</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
        {HZ.map(h => (
          <Pressable key={h} onPress={() => setHz(h)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: hz === h ? C.green : C.border, backgroundColor: hz === h ? C.greenBg : C.card }}>
            <Text style={{ color: hz === h ? C.green : C.sub, fontSize: 11, fontFamily: F.mono }}>{h.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
        {num(list.length, 'tracked', C.text)}
        {num(counts.up, 'up', C.green)}
        {num(counts.down, 'down', C.red)}
        {num(counts.stable, 'stable', C.text)}
        {num(counts.pending + counts.nodata, 'open', C.sub)}
      </View>

      <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono }}>SIMILAR SETUPS</Text>
        <Text style={{ color: valid >= 10 ? C.text : C.amber, fontSize: 12, marginTop: 6, fontFamily: F.mono }}>
          {valid >= 10 ? valid + ' valid observations at ' + hz + '. ' + counts.nodata + ' no data.' : 'Not enough observations yet — ' + valid + '/10 at ' + hz}
        </Text>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: C.border, marginTop: 8 }}>
          <View style={{ width: Math.min(100, valid * 10) + '%', height: 5, borderRadius: 3, backgroundColor: C.green }} />
        </View>
        <Text style={{ color: C.muted, fontSize: 9, marginTop: 8, lineHeight: 14, fontFamily: F.mono }}>Counted per flow rule. No-data outcomes are listed separately. Association, not accuracy.</Text>
      </View>

      {csv ? (
        <ScrollView horizontal style={{ marginTop: 12, maxHeight: 180, backgroundColor: C.card2, borderRadius: 10, padding: 10 }}>
          <Text selectable style={{ color: C.sub, fontSize: 9, fontFamily: F.mono }}>{csv}</Text>
        </ScrollView>
      ) : null}

      <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono, marginTop: 18, marginBottom: 6 }}>OBSERVATIONS</Text>

      {list.length === 0 ? (
        <Text style={{ color: C.sub, fontSize: 12, fontFamily: F.mono, marginTop: 8 }}>No observations yet. Analyze a token and it appears here.</Text>
      ) : list.map(o => (
        <View key={o.id} style={{ marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 14, fontFamily: F.head }}>{o.symbol ? '$' + o.symbol : String(o.mint).slice(0, 6)}</Text>
              <Text style={{ color: C.muted, fontSize: 9, fontFamily: F.mono, marginTop: 2 }}>{new Date(o.t).toLocaleString()}</Text>
            </View>
            <Text style={{ color: C.amber, fontSize: 10, fontFamily: F.mono, flex: 1.2, textAlign: 'center' }}>{o.flowLabel ?? o.marketState?.replace(/_/g, ' ') ?? '—'}</Text>
            {o.decision ? (
              <Text style={{ color: o.decision === 'BUY_DEMO' ? C.green : C.sub, fontSize: 10, fontFamily: F.monoBold }}>{o.decision === 'BUY_DEMO' ? 'BUY DEMO' : 'PASS'}</Text>
            ) : <Text style={{ color: C.muted, fontSize: 10, fontFamily: F.mono }}>—</Text>}
          </View>
          <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
            {HZ.map(h => cell(o, h))}
          </View>
        </View>
      ))}

      <Text style={{ color: C.muted, fontSize: 9, marginTop: 12, lineHeight: 14, fontFamily: F.mono }}>UP = +10% or more · DOWN = -10% or less · STABLE otherwise · NO DATA is never STABLE</Text>
    </ScrollView>
  )
}