/**
 * Order display pieces shared by customer and staff screens.
 */
import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatMoney } from '@/domain/money';
import { STATUS_LABELS } from '@/domain/order-state';
import { formatAgo, formatDay, formatTime } from '@/domain/time';
import type { Order, OrderStatus, PaymentStatus } from '@/domain/types';

import { Badge, type BadgeTone } from './ui/badge';
import { Card } from './ui/card';
import { Icon } from './ui/icon';
import { AppText } from './ui/text';

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  confirmed: 'primary',
  preparing: 'warning',
  ready: 'success',
  collected: 'neutral',
  missed: 'danger',
  cancelled: 'neutral',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge label={STATUS_LABELS[status]} tone={STATUS_TONES[status]} />;
}

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  paid: 'Paid',
  partially_refunded: 'Partly refunded',
  refunded: 'Refunded',
};

export function OrderCard({
  order,
  now,
  customerName,
  onPress,
}: {
  order: Order;
  now: Date;
  customerName?: string;
  onPress: () => void;
}) {
  const units = order.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <Card onPress={onPress} accessibilityLabel={`Order ${order.number}, ${STATUS_LABELS[order.status]}`} style={styles.card}>
      <View style={styles.row}>
        <AppText variant="subheading" style={styles.flex}>
          {order.number}
          {customerName ? <AppText variant="body" color="textSecondary">{`  ·  ${customerName}`}</AppText> : null}
        </AppText>
        <OrderStatusBadge status={order.status} />
      </View>
      <AppText variant="body" numberOfLines={2}>
        {order.items.map((i) => `${i.quantity} × ${i.productName} (${i.variantName})`).join(', ')}
      </AppText>
      <View style={styles.row}>
        <Icon name="clock" size={16} color={Colors.textSecondary} />
        <AppText variant="caption" color="textSecondary" style={styles.flex}>
          Pickup {formatDay(order.slotStart)}, {formatTime(order.slotStart)} – {formatTime(order.slotEnd)}
        </AppText>
        <AppText variant="bodyStrong">{formatMoney(order.total)}</AppText>
      </View>
      {order.delay && ['confirmed', 'preparing', 'ready'].includes(order.status) ? (
        <Badge label={`Delayed ~${order.delay.minutes} min`} tone="warning" />
      ) : null}
      {order.customerNote ? (
        <AppText variant="caption" color="textSecondary" numberOfLines={2}>
          Note: “{order.customerNote}”
        </AppText>
      ) : null}
      <AppText variant="small" color="textMuted">
        {units} item{units === 1 ? '' : 's'} · ordered {formatAgo(order.createdAt, now)}
      </AppText>
    </Card>
  );
}

const TIMELINE: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'collected'];

/** Confirmed → Preparing → Ready → Collected, with times for completed steps (US-05). */
export function StatusTimeline({ order }: { order: Order }) {
  if (order.status === 'cancelled') {
    return (
      <View style={styles.cancelled}>
        <Icon name="close" size={18} color={Colors.danger} />
        <AppText variant="bodyStrong" color="danger">
          Cancelled{order.cancelReason ? `: ${order.cancelReason}` : ''}
        </AppText>
      </View>
    );
  }
  const reachedIndex = order.status === 'missed' ? 2 : TIMELINE.indexOf(order.status);
  return (
    <View style={styles.timeline} accessibilityLabel={`Status: ${STATUS_LABELS[order.status]}`}>
      {TIMELINE.map((status, index) => {
        const done = index <= reachedIndex;
        const entry = [...order.history].reverse().find((h) => h.status === status);
        const isMissedStep = order.status === 'missed' && status === 'collected';
        return (
          <View key={status} style={styles.step}>
            <View style={styles.stepMarker}>
              <View style={[styles.dot, done && styles.dotDone, isMissedStep && styles.dotMissed]}>
                {done ? <Icon name="check" size={12} color={Colors.inverse} /> : null}
              </View>
              {index < TIMELINE.length - 1 ? <View style={[styles.line, index < reachedIndex && styles.lineDone]} /> : null}
            </View>
            <View style={styles.stepText}>
              <AppText variant={done ? 'bodyStrong' : 'body'} color={isMissedStep ? 'danger' : done ? 'text' : 'textMuted'}>
                {isMissedStep ? 'Missed pickup' : STATUS_LABELS[status]}
              </AppText>
              {entry && done ? (
                <AppText variant="caption" color="textSecondary">
                  {formatDay(entry.at)}, {formatTime(entry.at)}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  timeline: { gap: 0 },
  step: { flexDirection: 'row', gap: Spacing.three, minHeight: 48 },
  stepMarker: { alignItems: 'center', width: 22 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.track,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotMissed: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  line: { flex: 1, width: 2, backgroundColor: Colors.track, marginVertical: 2 },
  lineDone: { backgroundColor: Colors.primary },
  stepText: { flex: 1, paddingBottom: Spacing.two },
  cancelled: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.md,
    backgroundColor: Colors.dangerSoft,
  },
});
