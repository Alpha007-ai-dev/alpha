import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { C, F } from '../../lib/theme'

const icon = (ch: string) => ({ color, size }: { color: string; size: number }) => (
  <Text style={{ color, fontSize: size - 4, fontFamily: F.monoBold }}>{ch}</Text>
)

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0B0F0D', borderTopColor: C.border, height: 64, paddingBottom: 8, paddingTop: 8 },
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.sub,
        tabBarLabelStyle: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'ANALYZE', tabBarIcon: icon('[]') }} />
      <Tabs.Screen name="discover" options={{ title: 'DISCOVER', tabBarIcon: icon('()') }} />
      <Tabs.Screen name="journal" options={{ title: 'JOURNAL', tabBarIcon: icon('=') }} />
      <Tabs.Screen name="wallet" options={{ title: 'WALLET', tabBarIcon: icon('$') }} />
    </Tabs>
  )
}