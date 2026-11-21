import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon } from './icon';
import { AppText } from './text';

/** Expandable row, for example "Ingredients and allergens" on the item page. */
export function Collapsible({ title, children, initiallyOpen = false }: { title: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={() => setOpen((value) => !value)}
        style={styles.header}>
        <AppText variant="label" style={styles.title}>
          {title}
        </AppText>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} color={Colors.primary} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.surface, borderRadius: Radius.md, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, minHeight: 48 },
  title: { flex: 1 },
  body: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.two },
});
