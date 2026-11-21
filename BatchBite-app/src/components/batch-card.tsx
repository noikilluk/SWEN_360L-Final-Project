import { StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { type BatchBadge, batchBadges, findNextBatch, remainingRatio } from '@/domain/batch';
import { formatMoney } from '@/domain/money';
import { formatDay, formatRelativeDateTime } from '@/domain/time';
import type { Batch, Product, Settings } from '@/domain/types';

import { ProductImage } from './product-image';
import { Badge, type BadgeTone } from './ui/badge';
import { Card } from './ui/card';
import { ProgressBar } from './ui/progress-bar';
import { AppText } from './ui/text';

export const BADGE_INFO: Record<BatchBadge, { label: string; tone: BadgeTone }> = {
  sold_out: { label: 'Sold out', tone: 'neutral' },
  closed: { label: 'Ordering closed', tone: 'neutral' },
  closing_soon: { label: 'Closing soon', tone: 'warning' },
  pickup_today: { label: 'Pickup today', tone: 'success' },
};

/**
 * Batch card on the Home screen (wireframe 5.3): photo, name, price, quantity
 * left with a progress bar, the order deadline and status badges. Sold-out
 * batches stay visible but greyed, with the next batch date.
 */
export function BatchCard({
  batch,
  product,
  allBatches,
  settings,
  now,
  onPress,
}: {
  batch: Batch;
  product: Product;
  allBatches: Batch[];
  settings: Settings;
  now: Date;
  onPress: () => void;
}) {
  const badges = batchBadges(batch, now, settings);
  const unavailable = badges.includes('sold_out') || badges.includes('closed');
  const next = unavailable ? findNextBatch(batch, allBatches, now) : undefined;
  const deadlineText = unavailable
    ? next
      ? `Next batch ${formatDay(next.collectionStart)}`
      : 'No new batch scheduled yet'
    : `Closes ${formatRelativeDateTime(batch.orderDeadline, now)}`;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${product.name}, ${formatMoney(product.price)}, ${batch.remainingQuantity} of ${batch.maxQuantity} left, ${deadlineText}`}
      style={[styles.card, unavailable && styles.unavailable]}>
      <ProductImage product={product} size={84} dimmed={unavailable} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText variant="subheading" numberOfLines={1} style={styles.flex}>
            {product.name}
          </AppText>
          <AppText variant="subheading">{formatMoney(product.price)}</AppText>
        </View>
        <ProgressBar value={remainingRatio(batch)} label={`${batch.remainingQuantity} of ${batch.maxQuantity} left`} />
        <View style={styles.metaRow}>
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            {batch.remainingQuantity} of {batch.maxQuantity} left
          </AppText>
          {badges.slice(0, 1).map((badge) => (
            <Badge key={badge} {...BADGE_INFO[badge]} />
          ))}
        </View>
        <View style={styles.metaRow}>
          <AppText variant="caption" color={unavailable ? 'textMuted' : 'text'} style={styles.flex}>
            {deadlineText}
          </AppText>
          {badges.slice(1).map((badge) => (
            <Badge key={badge} {...BADGE_INFO[badge]} />
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  unavailable: { backgroundColor: '#F7F7F8' },
  body: { flex: 1, gap: Spacing.one + 2, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 20 },
  flex: { flex: 1, minWidth: 0 },
  muted: { color: Colors.textMuted },
});
