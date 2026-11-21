import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon } from './icon';
import { AppText } from './text';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  /** Wider centre for larger numbers (Create batch uses this). */
  wide?: boolean;
}

/** "−  2  +" control from the item page and cart wireframes. */
export function Stepper({ value, onChange, min = 0, max = 99, step = 1, label, wide }: StepperProps) {
  const canDecrease = value - step >= min;
  const canIncrease = value + step <= max;
  return (
    <View style={styles.row} accessibilityLabel={`${label}: ${value}`}>
      <StepButton icon="minus" label={`Decrease ${label}`} disabled={!canDecrease} onPress={() => onChange(value - step)} />
      <View style={[styles.value, wide && styles.wide]}>
        <AppText variant="subheading" align="center" accessibilityLiveRegion="polite">
          {value}
        </AppText>
      </View>
      <StepButton icon="plus" label={`Increase ${label}`} disabled={!canIncrease} onPress={() => onChange(value + step)} />
    </View>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
      <Icon name={icon} size={16} color={Colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  button: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: Colors.surfaceStrong },
  disabled: { opacity: 0.35 },
  value: { minWidth: 36, alignItems: 'center' },
  wide: {
    minWidth: 120,
    borderWidth: 1.2,
    borderColor: Colors.primaryMuted,
    borderRadius: Radius.md,
    paddingVertical: Spacing.two,
  },
});
