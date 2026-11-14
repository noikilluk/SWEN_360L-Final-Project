import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { AppText } from './text';

export type BadgeTone = 'warning' | 'success' | 'neutral' | 'danger' | 'primary' | 'info' | 'dark';

const TONES: Record<BadgeTone, { background: string; text: string }> = {
  warning: { background: Colors.warning, text: Colors.warningText },
  success: { background: Colors.success, text: Colors.successText },
  neutral: { background: Colors.surfaceStrong, text: Colors.textSecondary },
  danger: { background: Colors.dangerSoft, text: Colors.danger },
  primary: { background: Colors.primarySoft, text: Colors.primary },
  info: { background: Colors.info, text: Colors.infoText },
  dark: { background: '#2A2A30', text: Colors.inverse },
};

/** Small status label such as "Closing soon" (yellow) or "Pickup today" (green). */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const colors = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <AppText variant="small" style={{ color: colors.text }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.half,
  },
});
