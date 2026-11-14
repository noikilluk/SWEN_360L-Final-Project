import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SlotPicker } from '@/components/slot-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { Banner, EmptyState, KeyValue } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { getOrderForViewer } from '@/data/selectors';
import { isOpen } from '@/domain/batch';
import { formatMoney } from '@/domain/money';
import { formatDay, isSameDay, toDate } from '@/domain/time';
import type { ProposedItemChange } from '@/domain/types';
import { useDbState, useNow, useRequiredUser, useServices } from '@/state/app-provider';

/** Customer asks to change quantities, options, pickup slot or note on a confirmed order. */
export default function ChangeOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const now = useNow();
  const { toast, showError } = useFeedback();
  const order = getOrderForViewer(state, user, id);
  const [items, setItems] = useState<ProposedItemChange[]>(
    () => order?.items.map((i) => ({ orderItemId: i.id, variantId: i.variantId, quantity: i.quantity })) ?? [],
  );
  const [slotId, setSlotId] = useState(order?.slotId);
  const [note, setNote] = useState(order?.customerNote ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!order || order.customerId !== user.id) {
    return (
      <Screen header={<ScreenHeader back />}>
        <EmptyState icon="orders" title="Order not found" />
      </Screen>
    );
  }
  if (order.status !== 'confirmed') {
    return (
      <Screen header={<ScreenHeader back title="Change order" />}>
        <Banner tone="info" title="This order can no longer be changed" message="The kitchen has already started on it." />
      </Screen>
    );
  }

  const slots = Object.values(state.slots)
    .filter((s) => isSameDay(s.start, order.slotStart) && toDate(s.end) > now)
    .sort((a, b) => a.start.localeCompare(b.start));
  const newTotal = items.reduce((sum, p) => {
    const item = order.items.find((i) => i.id === p.orderItemId);
    return sum + (item ? item.unitPrice * p.quantity : 0);
  }, 0);
  const difference = newTotal - order.total;

  const submit = async () => {
    setBusy(true);
    try {
      await services.orders.requestChange(user.id, order.id, {
        type: 'modify',
        reason,
        items,
        slotId,
        note,
      });
      toast('Change request sent to the bakery');
      router.back();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<ScreenHeader back title="Change order" subtitle={`${order.number} · pickup ${formatDay(order.slotStart)}`} />}
      footer={<Button title="Send change request" variant="primary" onPress={submit} loading={busy} />}>
      <AppText variant="body" color="textSecondary">
        The bakery reviews every change. Prices stay at what you paid. Any difference is charged or refunded to
        your simulated card when the change is approved.
      </AppText>

      {order.items.map((item) => {
        const proposal = items.find((p) => p.orderItemId === item.id);
        const version = state.productVersions[item.productVersionId];
        const batch = state.batches[item.batchId];
        const canIncrease = batch ? isOpen(batch, now) : false;
        const max = canIncrease && batch ? Math.min(50, item.quantity + batch.remainingQuantity) : item.quantity;
        if (!proposal) return null;
        const update = (changes: Partial<ProposedItemChange>) =>
          setItems((current) => current.map((p) => (p.orderItemId === item.id ? { ...p, ...changes } : p)));
        return (
          <Card key={item.id}>
            <AppText variant="subheading">{item.productName}</AppText>
            <View style={styles.chips}>
              {(version?.variants ?? []).map((variant) => (
                <Chip key={variant.id} label={variant.name} selected={proposal.variantId === variant.id} onPress={() => update({ variantId: variant.id })} />
              ))}
            </View>
            <View style={styles.row}>
              <AppText variant="label" style={styles.flex}>
                Quantity {proposal.quantity === 0 ? '(remove)' : ''}
              </AppText>
              <Stepper label={`${item.productName} quantity`} value={proposal.quantity} min={0} max={max} onChange={(quantity) => update({ quantity })} />
            </View>
            {!canIncrease ? (
              <AppText variant="small" color="textSecondary">
                Ordering has closed for this batch, so the quantity can only go down.
              </AppText>
            ) : null}
          </Card>
        );
      })}

      <View style={styles.section}>
        <AppText variant="subheading">Pickup slot</AppText>
        <SlotPicker slots={slots} selectedId={slotId} allowId={order.slotId} onSelect={(slot) => setSlotId(slot.id)} />
      </View>

      <TextField label="Note for the baker" value={note} onChangeText={setNote} multiline maxLength={300} />
      <TextField label="Message to the bakery (optional)" placeholder="Why are you changing the order?" value={reason} onChangeText={setReason} maxLength={300} />

      <Card>
        <KeyValue label="Current total" value={formatMoney(order.total)} />
        <KeyValue label="New total" value={formatMoney(newTotal)} strong />
        {difference !== 0 ? (
          <AppText variant="caption" color="textSecondary">
            {difference > 0 ? `You would pay ${formatMoney(difference)} more.` : `You would get ${formatMoney(-difference)} back.`}
          </AppText>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  section: { gap: Spacing.two },
});
