import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

import { Icon, type IconName } from './icon';
import { AppText } from './text';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Buttons follow the wireframes: purple outline on white for most actions and
 * a filled purple button for the main confirmation on a screen.
 */
export function Button({
  title,
  onPress,
  variant = 'outline',
  size = 'md',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const palette = PALETTES[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.small : styles.medium,
        { backgroundColor: pressed ? palette.pressed : palette.background, borderColor: palette.border },
        inactive && styles.disabled,
        style,
      ]}>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : icon ? (
          <Icon name={icon} size={size === 'sm' ? 16 : 18} color={palette.text} />
        ) : null}
        <AppText
          variant={size === 'sm' ? 'label' : 'bodyStrong'}
          style={[{ color: palette.text }, styles.label]}
          numberOfLines={1}>
          {title}
        </AppText>
      </View>
    </Pressable>
  );
}

const PALETTES: Record<Variant, { background: string; pressed: string; border: string; text: string }> = {
  primary: { background: Colors.primary, pressed: Colors.primaryPressed, border: Colors.primary, text: Colors.inverse },
  outline: { background: Colors.background, pressed: Colors.primarySoft, border: Colors.primary, text: Colors.text },
  soft: { background: Colors.primarySoft, pressed: '#EAD5F8', border: Colors.primarySoft, text: Colors.primary },
  ghost: { background: 'transparent', pressed: Colors.surface, border: 'transparent', text: Colors.primary },
  danger: { background: Colors.background, pressed: Colors.dangerSoft, border: Colors.danger, text: Colors.danger },
};

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medium: { minHeight: 50, paddingHorizontal: Spacing.four },
  small: { minHeight: 38, paddingHorizontal: Spacing.three, borderRadius: Radius.sm },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { fontFamily: Fonts.semibold },
  disabled: { opacity: 0.4 },
});
