import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { C, F } from '../../lib/theme'

type Tok = any

const FILTERS = [
  { k: 'grad', label: 'Graduated' },
  { k: 'auth', label: 'Mint & freeze off' },
  { k: 'liq', label: 'Liquidity > $10K' },
  { k: 'hold', label: 'Holders > 100' },
  { k: 'new', label: 'New creator' },
]

const money = (v: number) => (v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v))

export default function Discover() {
  const router = useRouter()
  const [list, setList] = useState<Tok[]>([])
  const [on, setOn] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('https://lite-api.jup.ag/tokens/v2/recent')
      if (!r.ok) throw new Error()
      const arr = await r.json()
      setList(Array.isArray(arr) ? arr : [])
    } catch {
      setErr('Could not load new tokens. Pull to refresh.')
    }
    setBusy(false)
  }, [])

  useFocusEffect(useCallback(() => { if (!list.length) load() }, [load, list.length]))

  const keep = (t: Tok) => {
    if (on.grad && !t.graduatedPool) return false
    if (on.auth && !(t.audit?.mintAuthorityDisabled && t.audit?.freezeAuthorityDisabled)) return false
    if (on.liq && !(Number(t.liquidity) > 10000)) return false
    if (on.hold && !(Number(t.holderCount) > 100)) return false
    if (on.new && Number(t.audit?.devMints) !== 1) return false
    return true
  }
  const shown = list.filter(keep)

  const age = (t: Tok) => {
    const c = t.firstPool?.createdAt ?? t.createdAt
    if (!c) return ''
    const m = Math.floor((Date.now() - new Date(c).getTime()) / 60000)
    return m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingTop: 56, paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={C.green} />}>
      <Text style={{ color: C.text, fontSize: 26, fontFamily: F.head }}>Discover</Text>
      <Text style={{ color: C.sub, fontSize: 11, fontFamily: F.mono, marginTop: 4 }}>Find tokens that match your evidence criteria.</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        {FILTERS.map(f => (
          <Pressable key={f.k} onPress={() => setOn({ ...on, [f.k]: !on[f.k] })} style={{ paddingVertical: 8, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: on[f.k] ? C.green : C.border, backgroundColor: on[f.k] ? C.greenBg : C.card }}>
            <Text style={{ color: on[f.k] ? C.green : C.sub, fontSize: 10, fontFamily: F.mono }}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: C.sub, fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono, marginTop: 16, marginBottom: 8 }}>{'NEWEST FIRST · NO RANKING · ' + shown.length + ' OF ' + list.length}</Text>

      {err ? <Text style={{ color: C.amber, fontSize: 12, fontFamily: F.mono }}>{err}</Text> : null}
      {!err && shown.length === 0 && !busy ? <Text style={{ color: C.sub, fontSize: 12, fontFamily: F.mono }}>No tokens match these filters.</Text> : null}

      {shown.slice(0, 40).map((t: Tok) => (
        <Pressable key={t.id} onPress={() => router.push({ pathname: '/', params: { mint: t.id } })}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 14, fontFamily: F.head }}>{t.symbol ? '$' + t.symbol : String(t.id).slice(0, 6)}</Text>
            <Text style={{ color: C.muted, fontSize: 10, fontFamily: F.mono, marginTop: 3 }}>
              {(t.launchpad ?? 'unknown') + ' · ' + (t.graduatedPool ? 'graduated' : 'not graduated') + (t.audit?.devMints === 1 ? ' · new creator' : '')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: C.text, fontSize: 12, fontFamily: F.mono }}>{Number(t.liquidity) > 0 ? money(Number(t.liquidity)) : '--'}</Text>
            <Text style={{ color: C.muted, fontSize: 10, fontFamily: F.mono, marginTop: 3 }}>{age(t) + ' · ' + (t.holderCount ?? 0) + ' holders'}</Text>
          </View>
        </Pressable>
      ))}

      <Text style={{ color: C.muted, fontSize: 10, marginTop: 14, lineHeight: 15, fontFamily: F.mono }}>New launches from Jupiter, newest first. Alpha does not rank tokens.</Text>
    </ScrollView>
  )
}