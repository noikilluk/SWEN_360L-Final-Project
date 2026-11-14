import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { HeaderActions } from '@/components/header-actions';
import { ProductImage } from '@/components/product-image';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Banner, SectionTitle } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { batchSummary, pendingChangeRequests } from '@/data/selectors';
import { isOpen, soldQuantity } from '@/domain/batch';
import { formatMoney } from '@/domain/money';
import { isLowStock } from '@/domain/recipe';
import { DAY, formatDay, formatRelativeDateTime, formatTime, isSameDay } from '@/domain/time';
import { useDbState, useNow, useRequiredUser } from '@/state/app-provider';

/**
 * Owner dashboard (US-07, FR-09): today at a glance, things that need
 * attention, and confirmed orders per batch.
 */
export default function OwnerDashboard() {
  const user = useRequiredUser();
  const state = useDbState();
  const now = useNow();
  const orders = Object.values(state.orders);
  const todayOrders = orders.filter((o) => isSameDay(o.createdAt, now) && o.status !== 'cancelled');
  const todaySales = Object.values(state.payments)
    .filter((p) => isSameDay(p.createdAt, now))
    .reduce((sum, p) => sum + (p.kind === 'charge' ? p.amount : -p.amount), 0);
  const pickupsToday = orders.filter((o) => isSameDay(o.slotStart, now) && ['confirmed', 'preparing', 'ready'].includes(o.status));
  const readyNow = orders.filter((o) => o.status === 'ready').length;
  const requests = pendingChangeRequests(state);
  const lowStock = Object.values(state.ingredients).filter(isLowStock);
  // Only recent no-shows need action; older ones stay visible on the board and in insights.
  const missed = orders.filter((o) => o.status === 'missed' && now.getTime() - new Date(o.slotEnd).getTime() < 2 * DAY);

  const activeBatches = Object.values(state.batches)
    .filter((b) => b.status === 'published')
    .sort((a, b) => a.collectionStart.localeCompare(b.collectionStart));

  return (
    <Screen inTabs header={<ScreenHeader title={`Hi, ${user.displayName.split(' ')[0]}`} subtitle={state.settings.businessName} right={<HeaderActions />} />}>
      <View style={styles.stats}>
        <Stat label="Orders today" value={String(todayOrders.length)} />
        <Stat label="Sales today" value={formatMoney(todaySales)} />
        <Stat label="Pickups today" value={String(pickupsToday.length)} />
        <Stat label="Ready now" value={String(readyNow)} />
      </View>

      {requests.length || lowStock.length || missed.length ? (
        <View style={styles.section}>
          <SectionTitle title="Needs attention" />
          {requests.length ? (
            <Banner
              tone="primary"
              icon="edit"
              title={`${requests.length} change request${requests.length === 1 ? '' : 's'} waiting`}
              message="Customers asked to change or cancel orders."
              action="Review requests"
              onAction={() => router.push('/manage/requests')}
            />
          ) : null}
          {lowStock.length ? (
            <Banner
              tone="warning"
              icon="ingredients"
              title={`Low stock: ${lowStock.map((i) => i.name).join(', ')}`}
              message="Restock before publishing more batches."
              action="Open ingredients"
              onAction={() => router.push('/manage/ingredients')}
            />
          ) : null}
          {missed.length ? (
            <Banner
              tone="danger"
              title={`${missed.length} missed pickup${missed.length === 1 ? '' : 's'}`}
              message="These customers did not collect during their slot."
              action="View on the board"
              onAction={() => router.push('/manage/board')}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle title="Orders per batch" action="New batch" onAction={() => router.push('/manage/batch/form')} />
        {activeBatches.length === 0 ? (
          <AppText variant="body" color="textSecondary">
            No published batches. Create one to start taking orders.
          </AppText>
        ) : (
          activeBatches.map((batch) => {
            const product = state.products[batch.productId];
            const summary = batchSummary(state, batch.id);
            const open = isOpen(batch, now);
            return (
              <Card key={batch.id} onPress={() => router.push({ pathname: '/manage/batch/[id]', params: { id: batch.id } })} style={styles.batch}>
                <View style={styles.row}>
                  {product ? <ProductImage product={product} size={48} /> : null}
                  <View style={styles.flex}>
                    <AppText variant="subheading">{product?.name ?? 'Product'}</AppText>
                    <AppText variant="caption" color="textSecondary">
                      Collect {formatDay(batch.collectionStart)}, {formatTime(batch.collectionStart)}
                    </AppText>
                  </View>
                  <Badge label={open ? `Closes ${formatRelativeDateTime(batch.orderDeadline, now)}` : 'Ordering closed'} tone={open ? 'primary' : 'neutral'} />
                </View>
                <ProgressBar value={batch.maxQuantity ? soldQuantity(batch) / batch.maxQuantity : 0} label="Sold" />
                <AppText variant="caption">
                  {soldQuantity(batch)} of {batch.maxQuantity} sold · {summary.activeOrders.length} active order{summary.activeOrders.length === 1 ? '' : 's'}
                </AppText>
                <View style={styles.statusRow}>
                  <Badge label={`${summary.statusCounts.confirmed} to do`} tone="primary" />
                  <Badge label={`${summary.statusCounts.preparing} preparing`} tone="warning" />
                  <Badge label={`${summary.statusCounts.ready} ready`} tone="success" />
                  <Badge label={`${summary.statusCounts.collected} collected`} />
                </View>
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="title" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.half,
  },
  section: { gap: Spacing.three },
  batch: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, minWidth: 0 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
