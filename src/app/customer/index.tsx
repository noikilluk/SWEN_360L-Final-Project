import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BatchCard } from '@/components/batch-card';
import { HeaderActions } from '@/components/header-actions';
import { Logo } from '@/components/logo';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { customerBatches } from '@/data/selectors';
import { canOrder, isClosingSoon, isPickupToday } from '@/domain/batch';
import { useDbState, useNow } from '@/state/app-provider';

const FILTERS = ['All', 'Open now', 'Closing soon', 'Pickup today'] as const;
type Filter = (typeof FILTERS)[number];

/** Customer Home (wireframe 5.3, US-02): this week's batches with search and filters. */
export default function HomeScreen() {
  const state = useDbState();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');

  const allBatches = Object.values(state.batches);
  const entries = customerBatches(state, now).filter(({ batch, product }) => {
    const text = query.trim().toLowerCase();
    if (text && !`${product.name} ${product.description}`.toLowerCase().includes(text)) return false;
    if (filter === 'Open now') return canOrder(batch, now);
    if (filter === 'Closing soon') return isClosingSoon(batch, now, state.settings);
    if (filter === 'Pickup today') return isPickupToday(batch, now);
    return true;
  });

  return (
    <Screen inTabs header={<ScreenHeader left={<Logo size="small" />} right={<HeaderActions showCart />} />}>
      <View style={styles.intro}>
        <AppText variant="title">This week&apos;s batches</AppText>
        <AppText variant="body" color="textSecondary">
          Order ahead, pick up fresh.
        </AppText>
      </View>

      <View style={styles.search}>
        <Icon name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Desserts"
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
          accessibilityLabel="Search desserts"
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((name) => (
          <Chip key={name} label={name} selected={filter === name} onPress={() => setFilter(name)} />
        ))}
      </ScrollView>

      {entries.length === 0 ? (
        <EmptyState
          icon="product"
          title={query || filter !== 'All' ? 'Nothing matches' : 'No batches yet'}
          message={
            query || filter !== 'All'
              ? 'Try another search or filter.'
              : 'The bakery has not opened any batches this week. Check back soon.'
          }
          actionLabel={query || filter !== 'All' ? 'Show all batches' : undefined}
          onAction={() => {
            setQuery('');
            setFilter('All');
          }}
        />
      ) : (
        <View style={styles.list}>
          {entries.map(({ batch, product }) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              product={product}
              allBatches={allBatches}
              settings={state.settings}
              now={now}
              onPress={() => router.push({ pathname: '/batch/[id]', params: { id: batch.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: Spacing.half },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontFamily: Fonts.regular, fontSize: 15, color: Colors.text, paddingVertical: Spacing.two, minWidth: 0 },
  filters: { gap: Spacing.two, paddingRight: Spacing.four },
  list: { gap: Spacing.three },
});
