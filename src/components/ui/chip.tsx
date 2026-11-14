import { Pressable, StyleSheet } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

import { AppText } from './text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  /** Smaller text under the label, for example "3 left". */
  detail?: string;
  testID?: string;
}

/** Selectable chip used for filters, product options and pickup slots. */
export function Chip({ label, selected, disabled, onPress, detail, testID }: ChipProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && !selected && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <AppText
        variant="label"
        style={[styles.label, selected && styles.selectedLabel]}
        numberOfLines={1}>
        {label}
        {detail ? <AppText variant="small" color={selected ? 'inverse' : 'textSecondary'}>{`  |  ${detail}`}</AppText> : null}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1.2,
    borderColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.background,
    minHeight: 38,
    justifyContent: 'center',
  },
  selected: { backgroundColor: Colors.primary },
  pressed: { backgroundColor: Colors.primarySoft },
  disabled: { opacity: 0.4, borderColor: Colors.track },
  label: { fontFamily: Fonts.semibold },
  selectedLabel: { color: Colors.inverse },
});
