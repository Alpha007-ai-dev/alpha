import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { resolve, Result } from '../lib/resolver';

export default function Index() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setRes(null);
    const r = await resolve(input);
    setRes(r);
    setBusy(false);
  }

  const color =
    res?.status === 'VERIFIED' ? '#22c55e' : res?.status === 'AMBIGUOUS' ? '#fbbf24' : '#ef4444';

  return (
    <ScrollView style={s.root} contentContainerStyle={{ padding: 16, paddingTop: 60 }}>
      <Text style={s.brand}>ALPHA</Text>
      <Text style={s.tag}>Alpha never guesses a token. Alpha verifies it.</Text>

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

      {res ? (
        <View style={{ marginTop: 24 }}>
          <Text style={[s.status, { color, borderColor: color }]}>{res.status}</Text>
          <Text style={s.meta}>INPUT TYPE: {res.kind}</Text>
          {res.note ? <Text style={[s.note, { color }]}>{res.note}</Text> : null}

          {res.candidates.map((c, i) => (
            <View key={i} style={s.card}>
                            <Text style={s.sym}>{c.symbol ? '$' + c.symbol : 'UNKNOWN SYMBOL'}</Text>
              {c.verified ? <Text style={s.badge}>VERIFIED BY JUPITER</Text> : <Text style={s.warn}>NOT VERIFIED</Text>}
              {c.name ? <Text style={s.name}>{c.name}</Text> : null}
              <Text style={s.mint}>{c.mint}</Text>
              {c.liquidity !== undefined ? (
                <Text style={s.liq}>LIQUIDITY ${Math.round(c.liquidity).toLocaleString()}</Text>
              ) : null}
              <Text style={s.src}>via {c.source}</Text>
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
  tag: { color: '#4b5563', fontSize: 11, marginTop: 6, marginBottom: 24 },
  input: {
    borderWidth: 1, borderColor: '#262626', color: '#e5e7eb', padding: 12,
    minHeight: 90, fontSize: 13, textAlignVertical: 'top',
  },
  btn: { borderWidth: 1, borderColor: '#22c55e', paddingVertical: 12, marginTop: 12, alignItems: 'center' },
  btnText: { color: '#22c55e', letterSpacing: 2, fontSize: 12, fontWeight: '700' },
  status: { alignSelf: 'flex-start', borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12, fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  meta: { color: '#4b5563', fontSize: 10, letterSpacing: 1, marginTop: 10 },
  note: { fontSize: 12, marginTop: 8 },
  card: { borderWidth: 1, borderColor: '#262626', padding: 12, marginTop: 12 },
  sym: { color: '#e5e7eb', fontSize: 16, fontWeight: '700' },
    badge: { color: '#22c55e', fontSize: 10, letterSpacing: 1, marginTop: 4 },
  warn: { color: '#ef4444', fontSize: 10, letterSpacing: 1, marginTop: 4 },name: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  mint: { color: '#6b7280', fontSize: 10, marginTop: 8 },
  liq: { color: '#22c55e', fontSize: 11, marginTop: 6, letterSpacing: 1 },
  src: { color: '#4b5563', fontSize: 10, marginTop: 4 },
});
