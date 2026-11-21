import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OrderCard } from '@/components/order-parts';
import { ProductImage } from '@/components/product-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { EmptyState, KeyValue, SectionTitle } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { batchSummary, staffMembers } from '@/data/selectors';
import { isOpen, soldQuantity } from '@/domain/batch';
import { formatMoney } from '@/domain/money';
import { formatQuantity } from '@/domain/recipe';
import { formatDateTime } from '@/domain/time';
import type { ID } from '@/domain/types';
import { useDbState, useNow, useRequiredUser, useServices } from '@/state/app-provider';

/** One batch: orders, what to make, ingredients and owner actions (FR-09). */
export default function BatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const now = useNow();
  const { toast, confirm, prompt, showError } = useFeedback();
  const [assignee, setAssignee] = useState<ID | undefined>(undefined);
  const batch = state.batches[id];

  if (!batch) {
    return (
      <Screen header={<ScreenHeader back />}>
        <EmptyState icon="calendar" title="Batch not found" />
      </Screen>
    );
  }

  const product = state.products[batch.productId];
  const summary = batchSummary(state, batch.id);
  const isOwner = user.role === 'owner';
  const open = isOpen(batch, now);
  const revenue = summary.orders
    .filter((o) => o.status !== 'cancelled')
    .flatMap((o) => o.items)
    .filter((i) => i.batchId === batch.id)
    .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const pendingIngredients = new Map<string, number>();
  for (const order of summary.activeOrders) {
    if (order.ingredientsConsumed) continue;
    for (const hold of order.ingredientReservations) {
      pendingIngredients.set(hold.ingredientId, (pendingIngredients.get(hold.ingredientId) ?? 0) + hold.quantity);
    }
  }
  const delayable = summary.orders.filter((o) => ['confirmed', 'preparing', 'ready'].includes(o.status));

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast(message);
    } catch (error) {
      showError(error);
    }
  };

  const reportDelay = async () => {
    const minutes = await prompt({
      title: 'Delay the whole batch',
      message: `All ${delayable.length} active orders will be told they are running late.`,
      defaultValue: '30',
      keyboardType: 'number-pad',
      confirmLabel: 'Next',
      validate: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 && Number(v) <= 1440 ? null : 'Enter minutes between 1 and 1440.'),
    });
    if (minutes === null) return;
    const reason = await prompt({ title: 'Reason', placeholder: 'For example: delivery of flour was late', confirmLabel: 'Notify customers', validate: (v) => (v.trim() ? null : 'Give a short reason.') });
    if (reason === null) return;
    await run(() => services.orders.reportDelay(user.id, delayable.map((o) => o.id), Number(minutes), reason), 'Customers notified');
  };

  return (
    <Screen header={<ScreenHeader back title={product?.name ?? 'Batch'} subtitle={`Collect ${formatDateTime(batch.collectionStart)}`} />}>
      <Card>
        <View style={styles.row}>
          {product ? <ProductImage product={product} size={64} /> : null}
          <View style={styles.flex}>
            <Badge
              label={batch.status === 'draft' ? 'Draft' : batch.status === 'completed' ? 'Completed' : open ? 'Taking orders' : 'Ordering closed'}
              tone={batch.status === 'draft' ? 'warning' : open ? 'success' : 'neutral'}
            />
            <AppText variant="heading">
              {soldQuantity(batch)} of {batch.maxQuantity} sold
            </AppText>
          </View>
        </View>
        <ProgressBar value={batch.maxQuantity ? soldQuantity(batch) / batch.maxQuantity : 0} label="Sold" />
        <KeyValue label="Order deadline" value={formatDateTime(batch.orderDeadline)} />
        <KeyValue label="Collection" value={formatDateTime(batch.collectionStart)} />
        <KeyValue label="Active orders" value={String(summary.activeOrders.length)} />
        {isOwner ? <KeyValue label="Sales" value={formatMoney(revenue)} /> : null}
      </Card>

      {isOwner ? (
        <View style={styles.actions}>
          {batch.status === 'draft' ? <Button title="Publish" variant="primary" size="sm" onPress={() => run(() => services.batches.publishBatch(user.id, batch.id), 'Batch published')} /> : null}
          {batch.status !== 'completed' ? (
            <Button title="Edit" size="sm" icon="edit" onPress={() => router.push({ pathname: '/manage/batch/form', params: { batchId: batch.id } })} />
          ) : null}
          {batch.status === 'published' ? (
            <Button
              title="Mark completed"
              size="sm"
              onPress={async () => {
                const ok = await confirm({ title: 'Complete this batch?', message: 'It leaves the customer home screen and the production board.', confirmLabel: 'Complete' });
                if (ok) await run(() => services.batches.completeBatch(user.id, batch.id), 'Batch completed');
              }}
            />
          ) : null}
          {batch.status === 'draft' ? (
            <Button
              title="Delete draft"
              size="sm"
              variant="danger"
              onPress={async () => {
                const ok = await confirm({ title: 'Delete this draft?', confirmLabel: 'Delete', destructive: true });
                if (!ok) return;
                try {
                  await services.batches.deleteDraft(user.id, batch.id);
                  toast('Draft deleted');
                  router.back();
                } catch (error) {
                  showError(error);
                }
              }}
            />
          ) : null}
        </View>
      ) : null}

      <Card>
        <AppText variant="subheading">Still to make</AppText>
        {summary.toMake.length === 0 ? (
          <AppText variant="body" color="textSecondary">
            Nothing waiting for production.
          </AppText>
        ) : (
          summary.toMake.map((line) => <KeyValue key={line.variantName} label={line.variantName} value={`× ${line.quantity}`} />)
        )}
        {delayable.length ? <Button title="Report a delay for this batch" size="sm" icon="timer" onPress={reportDelay} /> : null}
      </Card>

      {pendingIngredients.size ? (
        <Card>
          <AppText variant="subheading">Ingredients reserved for these orders</AppText>
          {[...pendingIngredients].map(([ingredientId, quantity]) => {
            const ingredient = state.ingredients[ingredientId];
            return ingredient ? <KeyValue key={ingredientId} label={ingredient.name} value={formatQuantity(quantity, ingredient.unit)} /> : null;
          })}
        </Card>
      ) : null}

      {isOwner && summary.toMake.length ? (
        <Card>
          <AppText variant="subheading">Kitchen tasks</AppText>
          <AppText variant="caption" color="textSecondary">
            Create one task per option from the orders above.
          </AppText>
          <View style={styles.chips}>
            <Chip label="Unassigned" selected={!assignee} onPress={() => setAssignee(undefined)} />
            {staffMembers(state)
              .filter((s) => s.role === 'kitchen')
              .map((s) => (
                <Chip key={s.id} label={s.displayName} selected={assignee === s.id} onPress={() => setAssignee(s.id)} />
              ))}
          </View>
          <Button title="Generate tasks" size="sm" icon="tasks" onPress={() => run(() => services.production.generateBatchTasks(user.id, batch.id, assignee), 'Tasks created')} />
        </Card>
      ) : null}

      <View style={styles.list}>
        <SectionTitle title={`Orders (${summary.orders.length})`} />
        {summary.orders.length === 0 ? (
          <AppText variant="body" color="textSecondary">
            No orders yet.
          </AppText>
        ) : (
          summary.orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              now={now}
              customerName={state.users[order.customerId]?.displayName}
              onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, gap: Spacing.one },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  list: { gap: Spacing.three },
});
