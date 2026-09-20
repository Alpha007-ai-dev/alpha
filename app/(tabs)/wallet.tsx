import { View, Text } from 'react-native'
import { C, F } from '../../lib/theme'

export default function Screen() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.sub, fontFamily: F.mono, fontSize: 13 }}>WALLET - coming next</Text>
    </View>
  )
}