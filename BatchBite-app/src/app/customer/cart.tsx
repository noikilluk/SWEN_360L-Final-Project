import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HeaderActions } from '@/components/header-actions';
import { ProductImage } from '@/components/product-image';
import { SlotPicker } from '@/components/slot-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFeedback } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';
import { Banner, Divider, EmptyState, KeyValue } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { cartView } from '@/data/selectors';
import { formatMoney } from '@/domain/money';
import { formatDay } from '@/domain/time';
import { MAX_UNITS_PER_LINE } from '@/services/cart-service';
import { useDbState, useNow, useRequiredUser, useServices } from '@/state/app-provider';
import { HOME_HREF } from '@/state/navigation';

/** Cart and pickup (wireframe 5.5, US-03, US-04, FR-06, FR-07). */
export default function CartScreen() {
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const now = useNow();
  const { toast, showError } = useFeedback();
  const view = cartView(state, user.id, now);
  // While the customer is typing, the draft wins; otherwise show the saved note.
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const note = noteDraft ?? view.note;
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      showError(error);
    }
  };

  const saveNote = () => {
    if (noteDraft === null) return;
    if (noteDraft !== view.note) void run(() => services.cart.setNote(user.id, noteDraft));
    setNoteDraft(null);
  };

  const checkout = async () => {
    setBusy(true);
    try {
      if (note !== view.note) await services.cart.setNote(user.id, note);
      setNoteDraft(null);
      const order = await services.orders.checkout(user.id);
      toast(`Order ${order.number} confirmed`);
      router.push({ pathname: '/order/[id]', params: { id: order.id, placed: '1' } });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  if (view.lines.length === 0) {
    return (
      <Screen inTabs header={<ScreenHeader title="Your cart" right={<HeaderActions />} />}>
        <EmptyState
          icon="cart"
          title="Your cart is empty"
          message="Browse this week's batches and add something tasty."
          actionLabel="Browse batches"
          onAction={() => router.navigate(HOME_HREF.customer)}
        />
      </Screen>
    );
  }

  const selectedSlot = view.slots.find((s) => s.id === view.slotId);
  const day = view.collectionStarts[0];

  return (
    <Screen
      inTabs
      header={<ScreenHeader title="Your cart" right={<HeaderActions />} />}
      footer={
        <Button
          title={`Confirm order | ${formatMoney(view.subtotal)}`}
          variant="primary"
          onPress={checkout}
          loading={busy}
          disabled={view.hasProblems || !selectedSlot}
          testID="confirm-order"
        />
      }>
      {view.hasProblems ? (
        <Banner
          tone="warning"
          title="Some items cannot be ordered"
          message="They sold out or ordering closed since you added them."
          action="Remove unavailable items"
          onAction={() =>
            run(async () => {
              const removed = await services.cart.removeUnavailable(user.id);
              if (removed) toast(`Removed ${removed} item${removed === 1 ? '' : 's'}`, 'info');
            })
          }
        />
      ) : null}

      <View style={styles.lines}>
        {view.lines.map((line) => (
          <View key={line.item.id} style={styles.line}>
            {line.product ? <ProductImage product={line.product} size={92} dimmed={!!line.problem} /> : null}
            <View style={styles.lineBody}>
              <View style={styles.row}>
                <AppText variant="subheading" style={styles.flex} numberOfLines={1}>
                  {line.product?.name ?? 'Unavailable item'}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.product?.name ?? 'item'}`}
                  hitSlop={10}
                  onPress={() => run(() => services.cart.removeItem(user.id, line.item.id))}>
                  <Icon name="trash" size={18} color={Colors.textSecondary} />
                </Pressable>
              </View>
              <AppText variant="caption" color="textSecondary">
                {line.variant?.name ?? '—'} · {formatMoney(line.unitPrice)} each
              </AppText>
              {line.problem ? (
                <AppText variant="caption" color="danger">
                  {line.problem}
                </AppText>
              ) : null}
              <View style={styles.row}>
                <Stepper
                  label={`${line.product?.name ?? 'item'} quantity`}
                  value={line.item.quantity}
                  min={1}
                  max={Math.max(1, Math.min(MAX_UNITS_PER_LINE, line.batch?.remainingQuantity ?? 1))}
                  onChange={(value) => run(() => services.cart.updateQuantity(user.id, line.item.id, value))}
                />
                <AppText variant="bodyStrong" style={styles.lineTotal}>
                  {formatMoney(line.lineTotal)}
                </AppText>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <AppText variant="subheading">Pickup{day ? ` | ${formatDay(day)}` : ''}</AppText>
        <SlotPicker
          slots={view.slots}
          selectedId={view.slotId}
          onSelect={(slot) => run(() => services.cart.selectSlot(user.id, slot.id))}
        />
        {!selectedSlot ? (
          <AppText variant="caption" color="textSecondary">
            Choose a time to collect your order. Each slot takes a limited number of orders.
          </AppText>
        ) : null}
      </View>

      <TextField
        label="Note for the baker"
        placeholder="Allergies, a birthday message, anything we should know"
        value={note}
        onChangeText={setNoteDraft}
        onBlur={saveNote}
        multiline
        maxLength={300}
      />

      <Card>
        <KeyValue label="Subtotal" value={formatMoney(view.subtotal)} />
        <Divider />
        <KeyValue label="Total" value={formatMoney(view.subtotal)} strong />
      </Card>
      <View style={styles.payment}>
        <Icon name="payment" size={18} color={Colors.textSecondary} />
        <AppText variant="caption" color="textSecondary">
          Payment: simulated card ending {state.settings.simulatedCardLast4}. No real money is charged.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lines: { gap: Spacing.four },
  line: { flexDirection: 'row', gap: Spacing.three },
  lineBody: { flex: 1, gap: Spacing.one, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  lineTotal: { marginLeft: 'auto' },
  section: { gap: Spacing.two },
  payment: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
});
