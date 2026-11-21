import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { addDays, combineDayAndTime, dayKey, formatDay, formatNumericDate, formatTime, startOfDay } from '@/domain/time';

import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { AppText } from './ui/text';

const TIME_STEP_MINUTES = 15;

/**
 * Date and time picker built from plain components so it behaves the same on
 * Android, iOS and the web (matches the Create batch wireframe).
 */
export function DateTimeField({
  label,
  helper,
  value,
  onChange,
  error,
}: {
  label: string;
  helper?: string;
  value: Date;
  onChange: (value: Date) => void;
  error?: string | null;
}) {
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.row}>
        <FieldButton icon="calendar" text={formatNumericDate(value)} accessibilityLabel={`${label} date, ${formatDay(value)}`} onPress={() => setPicker('date')} invalid={!!error} />
        <FieldButton icon="clock" text={formatTime(value).toUpperCase()} accessibilityLabel={`${label} time, ${formatTime(value)}`} onPress={() => setPicker('time')} invalid={!!error} />
      </View>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" color="textSecondary">
          {helper}
        </AppText>
      ) : null}
      {picker ? (
        <PickerSheet
          title={picker === 'date' ? `${label}: date` : `${label}: time`}
          options={picker === 'date' ? dateOptions(value) : timeOptions(value)}
          selectedKey={picker === 'date' ? dayKey(value) : formatTime(value)}
          onClose={() => setPicker(null)}
          onSelect={(option) => {
            onChange(option.value);
            setPicker(null);
          }}
        />
      ) : null}
    </View>
  );
}

interface Option {
  key: string;
  label: string;
  value: Date;
}

function dateOptions(current: Date): Option[] {
  const today = startOfDay(new Date());
  const options: Option[] = [];
  for (let i = 0; i < 60; i++) {
    const day = addDays(today, i);
    options.push({
      key: dayKey(day),
      label: i === 0 ? `Today · ${formatDay(day)}` : i === 1 ? `Tomorrow · ${formatDay(day)}` : formatDay(day),
      value: combineDayAndTime(day, current.getHours(), current.getMinutes()),
    });
  }
  if (!options.some((o) => o.key === dayKey(current))) {
    options.unshift({ key: dayKey(current), label: formatDay(current), value: current });
  }
  return options;
}

function timeOptions(current: Date): Option[] {
  const options: Option[] = [];
  for (let minutes = 6 * 60; minutes < 24 * 60; minutes += TIME_STEP_MINUTES) {
    const value = combineDayAndTime(current, Math.floor(minutes / 60), minutes % 60);
    options.push({ key: formatTime(value), label: formatTime(value), value });
  }
  return options;
}

function FieldButton({
  icon,
  text,
  onPress,
  accessibilityLabel,
  invalid,
}: {
  icon: 'calendar' | 'clock';
  text: string;
  onPress: () => void;
  accessibilityLabel: string;
  invalid: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.field, invalid && styles.invalid, pressed && styles.pressed]}>
      <AppText variant="body" style={styles.flex}>
        {text}
      </AppText>
      <Icon name={icon} size={20} color={Colors.primary} />
    </Pressable>
  );
}

function PickerSheet({
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
}: {
  title: string;
  options: Option[];
  selectedKey: string;
  onSelect: (option: Option) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const initialIndex = Math.max(0, options.findIndex((o) => o.key === selectedKey));
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          <FlatList
            data={options}
            keyExtractor={(o) => o.key}
            style={styles.list}
            initialScrollIndex={Math.max(0, initialIndex - 2)}
            getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
            renderItem={({ item }) => {
              const selected = item.key === selectedKey;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item)}
                  style={[styles.option, selected && styles.optionSelected]}>
                  <AppText variant={selected ? 'bodyStrong' : 'body'} color={selected ? 'primary' : 'text'} style={styles.flex}>
                    {item.label}
                  </AppText>
                  {selected ? <Icon name="check" size={18} color={Colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.three },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: Colors.primaryMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    gap: Spacing.two,
  },
  invalid: { borderColor: Colors.danger },
  pressed: { backgroundColor: Colors.primarySoft },
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '75%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  list: { flexGrow: 0 },
  option: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.sm,
  },
  optionSelected: { backgroundColor: Colors.primarySoft },
});
