import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { EmptyState } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/domain/money';
import { formatAgo, formatDay, formatTime } from '@/domain/time';
import type { ChangeRequest } from '@/domain/types';
import { useDbState, useNow, useRequiredUser, useServices } from '@/state/app-provider';

/** Owner review of customer change and cancellation requests (Sprint 2: order changes and refunds). */
export default function RequestsScreen() {
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const now = useNow();
  const { toast, prompt, showError } = useFeedback();
  const [tab, setTab] = useState<'pending' | 'answered'>('pending');
  const all = Object.values(state.changeRequests).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = all.filter((r) => (tab === 'pending' ? r.status === 'pending' : r.status !== 'pending'));

  const resolve = async (request: ChangeRequest, approve: boolean) => {
    const note = await prompt({
      title: approve ? 'Approve request' : 'Decline request',
      message: approve
        ? request.type === 'cancel'
          ? 'The order is cancelled and the customer is refunded in full.'
          : 'The order is updated. Any price difference is charged or refunded automatically.'
        : 'The order stays as it was.',
      placeholder: 'Message to the customer (optional)',
      confirmLabel: approve ? 'Approve' : 'Decline',
      destructive: !approve,
    });
    if (note === null) return;
    try {
      const result = await services.orders.resolveRequest(user.id, request.id, approve, note);
      toast(
        approve
          ? result.priceDifference > 0
            ? `Approved. Customer charged ${formatMoney(result.priceDifference)}.`
            : result.priceDifference < 0
              ? `Approved. Customer refunded ${formatMoney(-result.priceDifference)}.`
              : 'Approved'
          : 'Declined',
      );
    } catch (error) {
      showError(error);
    }
  };

  return (
    <Screen header={<ScreenHeader back title="Change requests" />}>
      <View style={styles.tabs}>
        <Chip label={`Pending (${all.filter((r) => r.status === 'pending').length})`} selected={tab === 'pending'} onPress={() => setTab('pending')} />
        <Chip label="Answered" selected={tab === 'answered'} onPress={() => setTab('answered')} />
      </View>
      {shown.length === 0 ? (
        <EmptyState icon="edit" title={tab === 'pending' ? 'No pending requests' : 'Nothing answered yet'} />
      ) : (
        <View style={styles.list}>
          {shown.map((request) => {
            const order = state.orders[request.orderId];
            const customer = state.users[request.customerId];
            if (!order) return null;
            const newSlot = request.proposedSlotId ? state.slots[request.proposedSlotId] : undefined;
            const newTotal = request.proposedItems
              ? request.proposedItems.reduce((sum, p) => sum + (order.items.find((i) => i.id === p.orderItemId)?.unitPrice ?? 0) * p.quantity, 0)
              : order.subtotal;
            const difference = newTotal - order.subtotal;
            return (
              <Card key={request.id}>
                <View style={styles.row}>
                  <AppText variant="subheading" style={styles.flex}>
                    {order.number} · {request.type === 'cancel' ? 'Cancel' : 'Change'}
                  </AppText>
                  <Badge label={request.status} tone={request.status === 'pending' ? 'warning' : request.status === 'approved' ? 'success' : 'neutral'} />
                </View>
                <AppText variant="caption" color="textSecondary">
                  {customer?.displayName ?? 'Customer'} · {formatAgo(request.createdAt, now)} · order status: {order.status}
                </AppText>
                {request.reason ? <AppText variant="body">“{request.reason}”</AppText> : null}
                {request.proposedItems?.map((p) => {
                  const item = order.items.find((i) => i.id === p.orderItemId);
                  const before = request.originalItems?.find((o) => o.orderItemId === p.orderItemId);
                  if (!item && !before) return null;
                  const name = item?.productName ?? 'Item';
                  const version = item ? state.productVersions[item.productVersionId] : undefined;
                  const variant = version?.variants.find((v) => v.id === p.variantId)?.name ?? item?.variantName ?? '';
                  const fromQty = before?.quantity ?? item?.quantity ?? 0;
                  const fromVariant = before?.variantName ?? item?.variantName ?? '';
                  const changed = p.quantity !== fromQty || variant !== fromVariant;
                  return (
                    <AppText key={p.orderItemId} variant="caption" color={changed ? 'text' : 'textMuted'}>
                      {name}: {fromQty} × {fromVariant} → {p.quantity === 0 ? 'remove' : `${p.quantity} × ${variant}`}
                    </AppText>
                  );
                })}
                {newSlot ? (
                  <AppText variant="caption">
                    Pickup: {formatTime(request.originalSlotStart ?? order.slotStart)} → {formatDay(newSlot.start)}, {formatTime(newSlot.start)}
                  </AppText>
                ) : null}
                {request.proposedNote !== undefined ? <AppText variant="caption">New note: “{request.proposedNote}”</AppText> : null}
                {request.type === 'modify' && difference !== 0 ? (
                  <AppText variant="caption" color="textSecondary">
                    {difference > 0 ? `Customer pays ${formatMoney(difference)} more` : `Customer gets ${formatMoney(-difference)} back`}
                  </AppText>
                ) : null}
                {request.responseNote ? (
                  <AppText variant="caption" color="textSecondary">
                    Your reply: {request.responseNote}
                  </AppText>
                ) : null}
                <View style={styles.actions}>
                  {request.status === 'pending' ? (
                    <>
                      <Button title="Approve" size="sm" variant="primary" icon="check" onPress={() => resolve(request, true)} />
                      <Button title="Decline" size="sm" variant="danger" onPress={() => resolve(request, false)} />
                    </>
                  ) : null}
                  <Button title="View order" size="sm" variant="ghost" onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })} />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: Spacing.two },
  list: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.one },
});
