export const C = {
  bg: '#0A0D0C',
  card: '#111614',
  card2: '#0F1412',
  border: '#1C2622',
  border2: '#2A3833',
  text: '#E6EDE9',
  sub: '#8A9A92',
  muted: '#55625C',
  green: '#2BD97A',
  greenBg: '#16261E',
  greenInk: '#04130B',
  amber: '#F2B33D',
  amberBg: '#1A160D',
  amberBorder: '#5A4516',
  red: '#FF6B6B',
  blue: '#7CC4FF',
};

export const F = {
  mono: 'JetBrainsMono_400Regular',
  monoMed: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
  head: 'SpaceGrotesk_700Bold',
  headMed: 'SpaceGrotesk_500Medium',
};

export const S = { xs: 10, sm: 12, md: 14, lg: 20, xl: 32 };

export const flowColor = (k: string) =>
  k === 'BUYING_MOMENTUM' ? C.green
  : k === 'SELLING_PRESSURE' || k === 'CREATOR_SELLING' ? C.red
  : k === 'FEW_WALLETS' || k === 'FAST_IN_AND_OUT' ? C.amber
  : C.text;