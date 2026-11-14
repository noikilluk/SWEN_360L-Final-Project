import QRCode from 'qrcode';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';

/**
 * Renders `value` as a QR code. The matrix is generated in JavaScript with the
 * `qrcode` package and drawn as a single SVG path, so it works the same on
 * Android, iOS and the web.
 */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const modules = qr.modules;
    const n = modules.size;
    let d = '';
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [value]);

  const quiet = 2;
  const total = count + quiet * 2;
  return (
    <View accessibilityRole="image" accessibilityLabel="Collection QR code">
      <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${total} ${total}`}>
        <Rect x={-quiet} y={-quiet} width={total} height={total} fill={Colors.background} />
        <Path d={path} fill={Colors.text} />
      </Svg>
    </View>
  );
}
