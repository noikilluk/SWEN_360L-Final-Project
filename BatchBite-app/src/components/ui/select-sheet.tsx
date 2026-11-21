import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Button } from './button';
import { Icon } from './icon';
import { AppText } from './text';

export interface SelectOption {
  key: string;
  label: string;
  detail?: string;
}

/** Bottom sheet with a list of choices (used where a dropdown would be on the web). */
export function SelectSheet({
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
}: {
  title: string;
  options: SelectOption[];
  selectedKey?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
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
            renderItem={({ item }) => {
              const selected = item.key === selectedKey;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item.key)}
                  style={[styles.option, selected && styles.selected]}>
                  <View style={styles.flex}>
                    <AppText variant={selected ? 'bodyStrong' : 'body'} color={selected ? 'primary' : 'text'}>
                      {item.label}
                    </AppText>
                    {item.detail ? (
                      <AppText variant="small" color="textSecondary">
                        {item.detail}
                      </AppText>
                    ) : null}
                  </View>
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
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.sm, gap: Spacing.two },
  selected: { backgroundColor: Colors.primarySoft },
  flex: { flex: 1 },
});
