import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ordersForViewer } from '@/data/selectors';
import { STATUS_LABELS } from '@/domain/order-state';
import { addDays, formatTime, isSameDay } from '@/domain/time';
import type { Order, OrderStatus } from '@/domain/types';
import { useCurrentUser, useDbState, useNow, useServices } from '@/state/app-provider';

import { HeaderActions } from './header-actions';
import { OrderCard } from './order-parts';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Chip } from './ui/chip';
import { useFeedback } from './ui/feedback';
import { EmptyState } from './ui/misc';
import { Screen, ScreenHeader } from './ui/screen';
import { AppText } from './ui/text';

const DAYS = ['Today', 'Tomorrow', 'All upcoming'] as const;
type DayFilter = (typeof DAYS)[number];
const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: 'confirmed', label: 'To do' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
  { status: 'missed', label: 'Missed' },
];

/**
 * Production board (Sprint 2): every active order grouped by stage, with
 * one-tap status changes and a "to make" summary for the selected day.
 * Used by kitchen staff (home tab) and owners.
 */
export function ProductionBoard({ inTabs, back }: { inTabs?: boolean; back?: boolean }) {
  const user = useCurrentUser();
  const state = useDbState();
  const services = useServices();
  const now = useNow();
  const { toast, showError } = useFeedback();
  const [day, setDay] = useState<DayFilter>('Today');
  const [column, setColumn] = useState<OrderStatus>('confirmed');

  const matchesDay = (order: Order) => {
    if (day === 'Today') return isSameDay(order.slotStart, now) || (order.status === 'missed' && order.slotStart < now.toISOString());
    if (day === 'Tomorrow') return isSameDay(order.slotStart, addDays(now, 1));
    return true;
  };
  const active = ordersForViewer(state, user)
    .filter((o) => COLUMNS.some((c) => c.status === o.status))
    .filter(matchesDay)
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const shown = active.filter((o) => o.status === column);

  // "To make" summary for orders not yet ready.
  const toMake = new Map<string, number>();
  for (const order of active) {
    if (order.status !== 'confirmed' && order.status !== 'preparing') continue;
    for (const item of order.items) {
      const key = `${item.productName} · ${item.variantName}`;
      toMake.set(key, (toMake.get(key) ?? 0) + item.quantity);
    }
  }

  const bulk = async (to: 'preparing' | 'ready') => {
    if (!user) return;
    try {
      const count = await services.orders.bulkUpdateStatus(user.id, shown.map((o) => o.id), to);
      toast(`${count} order${count === 1 ? '' : 's'} moved to ${STATUS_LABELS[to]}`);
    } catch (error) {
      showError(error);
    }
  };

  const advance = async (order: Order, to: 'preparing' | 'ready') => {
    if (!user) return;
    try {
      await services.orders.updateStatus(user.id, order.id, to);
      toast(`${order.number}: ${STATUS_LABELS[to]}`);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <Screen
      inTabs={inTabs}
      header={<ScreenHeader back={back} title="Production board" subtitle={`${active.length} active order${active.length === 1 ? '' : 's'}`} right={<HeaderActions />} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {DAYS.map((d) => (
          <Chip key={d} label={d} selected={day === d} onPress={() => setDay(d)} />
        ))}
      </ScrollView>

      <Card>
        <AppText variant="subheading">To make</AppText>
        {toMake.size === 0 ? (
          <AppText variant="body" color="textSecondary">
            Nothing left to prepare for {day === 'All upcoming' ? 'upcoming pickups' : day.toLowerCase()}.
          </AppText>
        ) : (
          [...toMake]
            .sort((a, b) => b[1] - a[1])
            .map(([name, quantity]) => (
              <View key={name} style={styles.row}>
                <AppText variant="body" style={styles.flex}>
                  {name}
                </AppText>
                <AppText variant="bodyStrong">× {quantity}</AppText>
              </View>
            ))
        )}
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {COLUMNS.map((c) => (
          <Chip
            key={c.status}
            label={`${c.label} (${active.filter((o) => o.status === c.status).length})`}
            selected={column === c.status}
            onPress={() => setColumn(c.status)}
          />
        ))}
      </ScrollView>

      {shown.length > 1 && (column === 'confirmed' || column === 'preparing') ? (
        <Button
          title={column === 'confirmed' ? `Start all ${shown.length}` : `Mark all ${shown.length} ready`}
          variant="soft"
          size="sm"
          onPress={() => bulk(column === 'confirmed' ? 'preparing' : 'ready')}
        />
      ) : null}

      {shown.length === 0 ? (
        <EmptyState icon="kitchen" title={`No ${COLUMNS.find((c) => c.status === column)?.label.toLowerCase()} orders`} message="Try another day or stage." />
      ) : (
        <View style={styles.list}>
          {shown.map((order) => (
            <View key={order.id} style={styles.item}>
              <OrderCard
                order={order}
                now={now}
                customerName={state.users[order.customerId]?.displayName}
                onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
              />
              <View style={styles.actions}>
                <Badge label={`Slot ${formatTime(order.slotStart)}`} tone="info" />
                <View style={styles.flex} />
                {order.status === 'confirmed' ? <Button title="Start preparing" size="sm" variant="primary" onPress={() => advance(order, 'preparing')} /> : null}
                {order.status === 'preparing' ? <Button title="Mark ready" size="sm" variant="primary" onPress={() => advance(order, 'ready')} /> : null}
                {order.status === 'ready' || order.status === 'missed' ? (
                  <Button
                    title="Verify pickup"
                    size="sm"
                    variant="primary"
                    icon="scan"
                    onPress={() => router.push({ pathname: '/manage/scan', params: { orderId: order.id } })}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Spacing.two, paddingRight: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  list: { gap: Spacing.four },
  item: { gap: Spacing.two },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
