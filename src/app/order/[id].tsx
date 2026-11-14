import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OrderStatusBadge, PAYMENT_LABELS, StatusTimeline } from '@/components/order-parts';
import { QrCode } from '@/components/qr-code';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFeedback } from '@/components/ui/feedback';
import { Banner, Divider, EmptyState, KeyValue, SectionTitle } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { getOrderForViewer, paymentsForOrder, requestsForOrder } from '@/data/selectors';
import { formatMoney, parseMoney } from '@/domain/money';
import { STATUS_LABELS, nextKitchenStatus } from '@/domain/order-state';
import { can } from '@/domain/permissions';
import { formatDateTime, formatDay, formatTime } from '@/domain/time';
import type { ChangeRequest, Order } from '@/domain/types';
import { collectionQrPayload } from '@/services/order-helpers';
import { expectedReadyTime } from '@/services/order-service';
import { useDbState, useRequiredUser, useServices } from '@/state/app-provider';

/** Order details for customers (status, QR code, changes) and staff (production actions). */
export default function OrderDetailScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const { toast, confirm, prompt, showError } = useFeedback();
  const order = getOrderForViewer(state, user, id);

  if (!order) {
    return (
      <Screen header={<ScreenHeader back />}>
        <EmptyState icon="orders" title="Order not found" message="It may have been removed, or it belongs to another account." />
      </Screen>
    );
  }

  const isCustomer = user.id === order.customerId;
  const customer = state.users[order.customerId];
  const payments = paymentsForOrder(state, order.id);
  const requests = requestsForOrder(state, order.id);
  const pending = requests.find((r) => r.status === 'pending');
  const next = can(user, 'updateProduction') ? nextKitchenStatus(order.status) : null;
  const showQr = isCustomer && ['confirmed', 'preparing', 'ready', 'missed'].includes(order.status);
  const paid = payments.reduce((sum, p) => sum + (p.kind === 'charge' ? p.amount : -p.amount), 0);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast(success);
    } catch (error) {
      showError(error);
    }
  };

  const requestCancellation = async () => {
    const reason = await prompt({
      title: 'Request cancellation',
      message: 'The bakery will review your request. If approved, you are refunded in full.',
      placeholder: 'Why do you want to cancel?',
      confirmLabel: 'Send request',
      multiline: true,
      validate: (value) => (value.trim() ? null : 'Tell the bakery why you want to cancel.'),
    });
    if (reason === null) return;
    await run(() => services.orders.requestChange(user.id, order.id, { type: 'cancel', reason }), 'Cancellation requested');
  };

  const reportDelay = async () => {
    const minutesText = await prompt({
      title: 'Report a delay',
      message: 'How many minutes later than planned will this order be ready?',
      defaultValue: '30',
      keyboardType: 'number-pad',
      confirmLabel: 'Next',
      validate: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 && Number(v) <= 1440 ? null : 'Enter minutes between 1 and 1440.'),
    });
    if (minutesText === null) return;
    const reason = await prompt({
      title: 'Reason for the delay',
      placeholder: 'For example: the oven needed a repair',
      confirmLabel: 'Notify customer',
      validate: (v) => (v.trim() ? null : 'Give a short reason.'),
    });
    if (reason === null) return;
    await run(() => services.orders.reportDelay(user.id, [order.id], Number(minutesText), reason), 'Customer notified about the delay');
  };

  const cancelOrder = async () => {
    const reason = await prompt({
      title: `Cancel ${order.number}?`,
      message: `The customer is refunded ${formatMoney(paid)} and the stock and pickup slot are released.`,
      placeholder: 'Reason shown to the customer',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      destructive: true,
      validate: (v) => (v.trim() ? null : 'Give a reason so the customer knows why.'),
    });
    if (reason === null) return;
    await run(() => services.orders.cancel(user.id, order.id, reason), `${order.number} cancelled and refunded`);
  };

  const refund = async () => {
    const amountText = await prompt({
      title: 'Issue a refund',
      message: `Up to ${formatMoney(paid)} can be refunded to the simulated card.`,
      placeholder: 'Amount in BD, for example 1.50',
      keyboardType: 'decimal-pad',
      confirmLabel: 'Next',
      validate: (v) => {
        const fils = parseMoney(v);
        if (fils === null || fils <= 0) return 'Enter an amount such as 1.50.';
        if (fils > paid) return `The most you can refund is ${formatMoney(paid)}.`;
        return null;
      },
    });
    if (amountText === null) return;
    const reason = await prompt({ title: 'Reason for the refund', placeholder: 'For example: one item was damaged', confirmLabel: 'Refund', validate: (v) => (v.trim() ? null : 'Give a reason.') });
    if (reason === null) return;
    await run(() => services.orders.refund(user.id, order.id, parseMoney(amountText) ?? 0, reason), 'Refund issued');
  };

  const markMissed = async () => {
    const ok = await confirm({ title: 'Mark as missed?', message: 'The customer is told they missed their pickup. They can still collect later.', confirmLabel: 'Mark missed', destructive: true });
    if (ok) await run(() => services.orders.updateStatus(user.id, order.id, 'missed'), 'Marked as missed');
  };

  return (
    <Screen header={<ScreenHeader back title={`Order ${order.number}`} right={<OrderStatusBadge status={order.status} />} />}>
      {placed === '1' ? (
        <Banner tone="success" title="Order confirmed!" message="We've saved your pickup slot. Show the QR code below when you collect." />
      ) : null}
      {order.delay && ['confirmed', 'preparing', 'ready'].includes(order.status) ? (
        <Banner
          tone="warning"
          icon="timer"
          title={`Running about ${order.delay.minutes} min late`}
          message={`Expected around ${formatTime(expectedReadyTime(order))}. ${order.delay.reason}`}
        />
      ) : null}
      {order.status === 'missed' ? (
        <Banner tone="danger" title="Pickup missed" message="This order was not collected during its slot. It can still be collected with the QR code." />
      ) : null}

      {showQr ? (
        <Card tone="outline" style={styles.qrCard}>
          <QrCode value={collectionQrPayload(order)} size={190} />
          <AppText variant="mono" style={styles.code} selectable>
            {order.collectionCode}
          </AppText>
          <AppText variant="caption" color="textSecondary" align="center">
            Show this code at pickup. The bakery scans it to confirm collection.
          </AppText>
        </Card>
      ) : null}

      <Card>
        <AppText variant="subheading">Status</AppText>
        <StatusTimeline order={order} />
      </Card>

      <Card>
        <AppText variant="subheading">Pickup</AppText>
        <KeyValue label="Day" value={formatDay(order.slotStart)} />
        <KeyValue label="Time" value={`${formatTime(order.slotStart)} – ${formatTime(order.slotEnd)}`} />
        {!isCustomer && customer ? <KeyValue label="Customer" value={`${customer.displayName} (@${customer.username})`} /> : null}
        {order.collectedAt ? <KeyValue label="Collected" value={formatDateTime(order.collectedAt)} /> : null}
        {order.customerNote ? (
          <View style={styles.note}>
            <AppText variant="caption" color="textSecondary">
              Note for the baker
            </AppText>
            <AppText variant="body">“{order.customerNote}”</AppText>
          </View>
        ) : null}
      </Card>

      <Card>
        <AppText variant="subheading">Items</AppText>
        {order.items.map((item) => {
          const product = state.products[item.productId];
          const priceChanged = product && (product.price !== item.unitPrice || product.version !== item.productVersion);
          return (
            <View key={item.id} style={styles.item}>
              <View style={styles.row}>
                <AppText variant="body" style={styles.flex}>
                  {item.quantity} × {item.productName} ({item.variantName})
                </AppText>
                <AppText variant="bodyStrong">{formatMoney(item.quantity * item.unitPrice)}</AppText>
              </View>
              {priceChanged ? (
                <AppText variant="small" color="textSecondary">
                  Price and recipe locked at version {item.productVersion} ({formatMoney(item.unitPrice)} each). Current price {formatMoney(product.price)}.
                </AppText>
              ) : null}
            </View>
          );
        })}
        <Divider />
        <KeyValue label="Total" value={formatMoney(order.total)} strong />
      </Card>

      <Card>
        <View style={styles.row}>
          <AppText variant="subheading" style={styles.flex}>
            Payment
          </AppText>
          <Badge label={PAYMENT_LABELS[order.paymentStatus]} tone={order.paymentStatus === 'paid' ? 'success' : 'warning'} />
        </View>
        {payments.map((payment) => (
          <View key={payment.id} style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="body">
                {payment.kind === 'charge' ? 'Charged' : 'Refunded'} · card ending {payment.cardLast4}
              </AppText>
              <AppText variant="small" color="textMuted">
                {formatDateTime(payment.createdAt)} · {payment.reference}
                {payment.reason ? ` · ${payment.reason}` : ''}
              </AppText>
            </View>
            <AppText variant="bodyStrong" color={payment.kind === 'refund' ? 'successText' : 'text'}>
              {payment.kind === 'refund' ? '−' : ''}
              {formatMoney(payment.amount)}
            </AppText>
          </View>
        ))}
        <AppText variant="small" color="textMuted">
          Simulated payments only. No real money is moved.
        </AppText>
      </Card>

      {requests.length ? (
        <View style={styles.section}>
          <SectionTitle title="Change requests" />
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              order={order}
              onWithdraw={
                isCustomer && request.status === 'pending'
                  ? () => run(() => services.orders.withdrawRequest(user.id, request.id), 'Request withdrawn')
                  : undefined
              }
              onReview={user.role === 'owner' && request.status === 'pending' ? () => router.push('/manage/requests') : undefined}
            />
          ))}
        </View>
      ) : null}

      {isCustomer && order.status === 'confirmed' && state.settings.allowChangeRequests && !pending ? (
        <View style={styles.section}>
          <SectionTitle title="Need to change something?" />
          <AppText variant="caption" color="textSecondary">
            You can ask for changes until the kitchen starts preparing your order.
          </AppText>
          <Button title="Request a change" icon="edit" onPress={() => router.push({ pathname: '/order/change/[id]', params: { id: order.id } })} />
          <Button title="Request cancellation" variant="danger" onPress={requestCancellation} />
        </View>
      ) : null}

      {!isCustomer && can(user, 'updateProduction') ? (
        <View style={styles.section}>
          <SectionTitle title="Kitchen actions" />
          {next ? (
            <Button
              title={next === 'preparing' ? 'Start preparing' : 'Mark as ready'}
              variant="primary"
              icon={next === 'preparing' ? 'kitchen' : 'box'}
              onPress={() => run(() => services.orders.updateStatus(user.id, order.id, next), `${order.number}: ${STATUS_LABELS[next]}`)}
            />
          ) : null}
          {order.status === 'ready' || order.status === 'missed' ? (
            <Button title="Verify pickup (scan QR)" variant="primary" icon="scan" onPress={() => router.push({ pathname: '/manage/scan', params: { orderId: order.id } })} />
          ) : null}
          {['confirmed', 'preparing', 'ready'].includes(order.status) ? <Button title="Report a delay" icon="timer" onPress={reportDelay} /> : null}
          {user.role === 'owner' && order.status === 'ready' ? <Button title="Mark as missed pickup" variant="danger" onPress={markMissed} /> : null}
          {user.role === 'owner' && order.status === 'confirmed' ? <Button title="Cancel order" variant="danger" icon="close" onPress={cancelOrder} /> : null}
          {user.role === 'owner' && paid > 0 && order.status !== 'cancelled' ? <Button title="Issue a refund" icon="undo" onPress={refund} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

function RequestCard({
  request,
  order,
  onWithdraw,
  onReview,
}: {
  request: ChangeRequest;
  order: Order;
  onWithdraw?: () => void;
  onReview?: () => void;
}) {
  const state = useDbState();
  const tone = request.status === 'approved' ? 'success' : request.status === 'pending' ? 'warning' : 'neutral';
  const variantName = (versionId: string, variantId: string) =>
    state.productVersions[versionId]?.variants.find((v) => v.id === variantId)?.name ?? 'option';
  return (
    <Card tone="outline">
      <View style={styles.row}>
        <AppText variant="bodyStrong" style={styles.flex}>
          {request.type === 'cancel' ? 'Cancellation' : 'Change'} request
        </AppText>
        <Badge label={request.status.charAt(0).toUpperCase() + request.status.slice(1)} tone={tone} />
      </View>
      <AppText variant="caption" color="textSecondary">
        Sent {formatDateTime(request.createdAt)}
      </AppText>
      {request.reason ? <AppText variant="body">“{request.reason}”</AppText> : null}
      {request.proposedItems?.map((p) => {
        const item = order.items.find((i) => i.id === p.orderItemId);
        const before = request.originalItems?.find((o) => o.orderItemId === p.orderItemId);
        return item ? (
          <AppText key={p.orderItemId} variant="caption">
            {item.productName}: {before?.quantity ?? item.quantity} × {before?.variantName ?? item.variantName} →{' '}
            {p.quantity === 0 ? 'remove' : `${p.quantity} × ${variantName(item.productVersionId, p.variantId)}`}
          </AppText>
        ) : null;
      })}
      {request.proposedSlotId ? <AppText variant="caption">New pickup slot requested</AppText> : null}
      {request.proposedNote !== undefined ? <AppText variant="caption">New note: “{request.proposedNote}”</AppText> : null}
      {request.responseNote ? (
        <AppText variant="caption" color="textSecondary">
          Bakery: {request.responseNote}
        </AppText>
      ) : null}
      {request.priceDifference ? (
        <AppText variant="caption" color="textSecondary">
          {request.priceDifference > 0 ? `Charged ${formatMoney(request.priceDifference)}` : `Refunded ${formatMoney(-request.priceDifference)}`}
        </AppText>
      ) : null}
      {onWithdraw ? <Button title="Withdraw request" size="sm" variant="ghost" onPress={onWithdraw} /> : null}
      {onReview ? <Button title="Review request" size="sm" variant="soft" onPress={onReview} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  qrCard: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.five },
  code: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
    fontSize: 20,
    letterSpacing: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  item: { gap: Spacing.half },
  note: { gap: Spacing.half, marginTop: Spacing.one },
  section: { gap: Spacing.three },
});
