import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type CardProps = ViewProps & {
  /** `surface` is the grey cell from the wireframes; `outline` is white with a border. */
  tone?: 'surface' | 'outline' | 'primary' | 'warning' | 'danger' | 'success';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Card({ tone = 'surface', onPress, style, children, accessibilityLabel, ...rest }: CardProps) {
  const toneStyle = TONE_STYLES[tone];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.card, toneStyle, pressed && styles.pressed, style]}
        {...rest}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, toneStyle, style]} accessibilityLabel={accessibilityLabel} {...rest}>
      {children}
    </View>
  );
}

const TONE_STYLES = StyleSheet.create({
  surface: { backgroundColor: Colors.surface },
  outline: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  primary: { backgroundColor: Colors.primarySoft },
  warning: { backgroundColor: '#FBF4D8', borderWidth: 1, borderColor: Colors.warning },
  danger: { backgroundColor: Colors.dangerSoft },
  success: { backgroundColor: Colors.successSoft },
});

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.two },
  pressed: { opacity: 0.85 },
});
