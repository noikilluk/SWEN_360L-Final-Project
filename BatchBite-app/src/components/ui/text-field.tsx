import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

import { Icon } from './icon';
import { AppText } from './text';

export type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string | null;
  helper?: string;
  /** Shows a show/hide toggle for password fields. */
  password?: boolean;
};

/** Labelled input with a purple outline, inline error and optional helper text. */
export function TextField({ label, error, helper, password, style, multiline, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? Colors.danger : focused ? Colors.primary : Colors.primaryMuted;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={[styles.inputRow, { borderColor }, multiline && styles.multilineRow]}>
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, multiline && styles.multiline, style]}
          secureTextEntry={password ? hidden : rest.secureTextEntry}
          autoCapitalize={password ? 'none' : rest.autoCapitalize}
          autoCorrect={password ? false : rest.autoCorrect}
          multiline={multiline}
          accessibilityLabel={label ?? rest.placeholder}
          accessibilityHint={error ?? helper}
          {...rest}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((value) => !value)}
            hitSlop={10}
            style={styles.eye}>
            <Icon name={hidden ? 'eye' : 'eyeOff'} size={18} color={Colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" color="textSecondary">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.one },
  label: { marginBottom: Spacing.half },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    minHeight: 48,
  },
  multilineRow: { alignItems: 'flex-start' },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: Colors.text,
    minWidth: 0,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  eye: { paddingHorizontal: Spacing.three, alignSelf: 'stretch', justifyContent: 'center' },
});
