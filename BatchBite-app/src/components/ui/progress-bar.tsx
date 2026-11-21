import { StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

/** Purple fill on a grey track. `value` is clamped to 0..1. */
export function ProgressBar({ value, height = 8, label }: { value: number; height?: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height }]}>
      <View style={[styles.fill, { width: `${clamped * 100}%`, borderRadius: height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: Colors.track, overflow: 'hidden', width: '100%', borderRadius: Radius.pill },
  fill: { backgroundColor: Colors.primary, height: '100%' },
});
