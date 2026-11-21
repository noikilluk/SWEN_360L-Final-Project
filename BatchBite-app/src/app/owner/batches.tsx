import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HeaderActions } from '@/components/header-actions';
import { ProductImage } from '@/components/product-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { isOpen, soldQuantity } from '@/domain/batch';
import { formatDateTime } from '@/domain/time';
import type { Batch } from '@/domain/types';
import { useDbState, useNow } from '@/state/app-provider';

const TABS = ['Live', 'Drafts', 'Completed'] as const;
type Tab = (typeof TABS)[number];

/** All batches by stage, with a button to create one (US-06). */
export default function OwnerBatches() {
  const state = useDbState();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('Live');
  const all = Object.values(state.batches);
  const byTab: Record<Tab, Batch[]> = {
    Live: all.filter((b) => b.status === 'published').sort((a, b) => a.collectionStart.localeCompare(b.collectionStart)),
    Drafts: all.filter((b) => b.status === 'draft').sort((a, b) => a.collectionStart.localeCompare(b.collectionStart)),
    Completed: all.filter((b) => b.status === 'completed').sort((a, b) => b.collectionStart.localeCompare(a.collectionStart)),
  };
  const shown = byTab[tab];

  return (
    <Screen
      inTabs
      header={<ScreenHeader title="Batches" right={<HeaderActions />} />}
      footer={<Button title="Create batch" variant="primary" icon="plus" onPress={() => router.push('/manage/batch/form')} />}>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Chip key={t} label={`${t} (${byTab[t].length})`} selected={tab === t} onPress={() => setTab(t)} />
        ))}
      </View>
      {shown.length === 0 ? (
        <EmptyState icon="calendar" title={`No ${tab.toLowerCase()} batches`} />
      ) : (
        <View style={styles.list}>
          {shown.map((batch) => {
            const product = state.products[batch.productId];
            const open = isOpen(batch, now);
            return (
              <Card key={batch.id} onPress={() => router.push({ pathname: '/manage/batch/[id]', params: { id: batch.id } })}>
                <View style={styles.row}>
                  {product ? <ProductImage product={product} size={52} /> : null}
                  <View style={styles.flex}>
                    <AppText variant="subheading">{product?.name ?? 'Product'}</AppText>
                    <AppText variant="caption" color="textSecondary">
                      Deadline {formatDateTime(batch.orderDeadline)}
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      Collect {formatDateTime(batch.collectionStart)}
                    </AppText>
                  </View>
                  {batch.status === 'published' ? (
                    <Badge label={batch.remainingQuantity === 0 ? 'Sold out' : open ? 'Open' : 'Closed'} tone={open && batch.remainingQuantity ? 'success' : 'neutral'} />
                  ) : (
                    <Badge label={batch.status === 'draft' ? 'Draft' : 'Completed'} tone={batch.status === 'draft' ? 'warning' : 'neutral'} />
                  )}
                </View>
                <ProgressBar value={batch.maxQuantity ? soldQuantity(batch) / batch.maxQuantity : 0} label="Sold" />
                <AppText variant="caption">
                  {soldQuantity(batch)} of {batch.maxQuantity} sold
                </AppText>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  list: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, minWidth: 0 },
});
