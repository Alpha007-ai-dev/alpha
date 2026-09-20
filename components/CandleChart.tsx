import { useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { Candle } from '../lib/chart';

export const fmtPx = (v: number) => {
  if (!isFinite(v) || v <= 0) return '--';
  if (v >= 1) return v.toFixed(2);
  const d = Math.min(12, 3 - Math.floor(Math.log10(v)));
  return v.toFixed(d);
};

export default function CandleChart({ candles, height = 180 }: { candles: Candle[]; height?: number }) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const padR = 70;
  const padY = 8;
  const plotW = Math.max(0, w - padR);
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of candles) {
    if (c.h > hi) hi = c.h;
    if (c.l < lo) lo = c.l;
  }
  if (!(hi > lo)) {
    hi = isFinite(hi) ? hi * 1.01 : 1;
    lo = isFinite(lo) ? lo * 0.99 : 0;
  }
  const y = (v: number) => padY + ((hi - v) / (hi - lo)) * (height - 2 * padY);
  const step = candles.length ? plotW / candles.length : 0;
  const bw = Math.max(1, step * 0.6);
  const last = candles.length ? candles[candles.length - 1].c : NaN;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={0} y1={y(hi)} x2={plotW} y2={y(hi)} stroke="#1f2937" strokeWidth={1} />
          <Line x1={0} y1={y(lo)} x2={plotW} y2={y(lo)} stroke="#1f2937" strokeWidth={1} />
          {candles.map((c, i) => {
            const x = i * step + step / 2;
            const col = c.c >= c.o ? '#22c55e' : '#ef4444';
            const top = y(Math.max(c.o, c.c));
            const bh = Math.max(1, Math.abs(y(c.o) - y(c.c)));
            return [
              <Line key={'w' + i} x1={x} y1={y(c.h)} x2={x} y2={y(c.l)} stroke={col} strokeWidth={1} />,
              <Rect key={'b' + i} x={x - bw / 2} y={top} width={bw} height={bh} fill={col} />,
            ];
          })}
          {isFinite(last) ? (
            <Line x1={0} y1={y(last)} x2={plotW} y2={y(last)} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3,3" />
          ) : null}
          <SvgText x={plotW + 4} y={y(hi) + 8} fill="#6b7280" fontSize={9}>{fmtPx(hi)}</SvgText>
          <SvgText x={plotW + 4} y={y(lo)} fill="#6b7280" fontSize={9}>{fmtPx(lo)}</SvgText>
          {isFinite(last) ? (
            <SvgText x={plotW + 4} y={y(last) + 3} fill="#e5e7eb" fontSize={10}>{fmtPx(last)}</SvgText>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}