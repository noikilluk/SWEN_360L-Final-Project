import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { ProductImage } from '@/components/product-image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { Banner, EmptyState } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { AppText } from '@/components/ui/text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { soldQuantity } from '@/domain/batch';
import { findShortfalls, formatQuantity } from '@/domain/recipe';
import { addDays, combineDayAndTime, formatDay, formatTime, isSameDay, startOfDay, toDate } from '@/domain/time';
import { estimateBatchNeeds } from '@/services/batch-service';
import { useDbState, useNow, useRequiredUser, useServices } from '@/state/app-provider';

const QUICK_QUANTITIES = [12, 20, 24, 30, 40, 60];

/** Create or edit a batch (wireframe 5.6, US-06, FR-03). */
export default function BatchFormScreen() {
  const { batchId, productId: initialProductId } = useLocalSearchParams<{ batchId?: string; productId?: string }>();
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const { toast, showError } = useFeedback();
  const now = useNow();
  const existing = batchId ? state.batches[batchId] : undefined;
  const products = Object.values(state.products).filter((p) => p.active || p.id === existing?.productId);

  const [productId, setProductId] = useState(existing?.productId ?? initialProductId ?? products[0]?.id);
  const [maxQuantity, setMaxQuantity] = useState(existing?.maxQuantity ?? 40);
  const [deadline, setDeadline] = useState(() =>
    existing ? toDate(existing.orderDeadline) : combineDayAndTime(addDays(startOfDay(new Date()), 1), 18, 0),
  );
  const [collection, setCollection] = useState(() =>
    existing ? toDate(existing.collectionStart) : combineDayAndTime(addDays(startOfDay(new Date()), 3), 16, 0),
  );
  const [slotCount, setSlotCount] = useState(state.settings.defaultSlotsPerBatch);
  const [slotMinutes, setSlotMinutes] = useState(state.settings.defaultSlotMinutes);
  const [slotCapacity, setSlotCapacity] = useState(state.settings.defaultSlotCapacity);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);

  if (products.length === 0) {
    return (
      <Screen header={<ScreenHeader back title="Create batch" />}>
        <EmptyState icon="product" title="Add a product first" message="A batch is a limited run of one of your products." actionLabel="Add product" onAction={() => router.replace({ pathname: '/manage/product/[id]', params: { id: 'new' } })} />
      </Screen>
    );
  }

  const product = productId ? state.products[productId] : undefined;
  const sold = existing ? soldQuantity(existing) : 0;
  const deadlineError = deadline.getTime() <= now.getTime() ? 'The deadline must be in the future to publish.' : null;
  const collectionError = collection.getTime() <= deadline.getTime() ? 'Collection must start after the order deadline.' : null;
  const daySlots = Object.values(state.slots).filter((s) => isSameDay(s.start, collection) && toDate(s.start) >= collection);
  const needsSlots = daySlots.length === 0;
  const needs = product ? estimateBatchNeeds(product, Math.max(0, maxQuantity - sold)) : [];
  const shortfalls = findShortfalls(needs, state.ingredients);

  const save = async (publish: boolean) => {
    if (!productId) return;
    setBusy(publish ? 'publish' : 'draft');
    try {
      const input = { productId, maxQuantity, orderDeadline: deadline, collectionStart: collection };
      const slots = publish && needsSlots ? { count: slotCount, minutes: slotMinutes, capacity: slotCapacity } : undefined;
      const batch = existing
        ? await services.batches.updateBatch(user.id, existing.id, input, { publish, slots })
        : await services.batches.createBatch(user.id, input, { publish, slots });
      toast(publish ? 'Batch published. Customers can order now.' : 'Draft saved');
      router.replace({ pathname: '/manage/batch/[id]', params: { id: batch.id } });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  const isPublished = existing?.status === 'published';

  return (
    <Screen
      header={<ScreenHeader back title={existing ? 'Edit batch' : 'Create batch'} />}
      footer={
        <View style={styles.footer}>
          {!isPublished ? <Button title="Save draft" onPress={() => save(false)} loading={busy === 'draft'} disabled={!!busy} style={styles.flex} /> : null}
          <Button
            title={isPublished ? 'Save changes' : 'Publish batch'}
            variant="primary"
            onPress={() => save(true)}
            loading={busy === 'publish'}
            disabled={!!busy || !!collectionError}
            style={styles.flex}
          />
        </View>
      }>
      <View style={styles.section}>
        <AppText variant="label">Product</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.products}>
          {products.map((p) => {
            const selected = p.id === productId;
            const locked = !!existing && sold > 0 && p.id !== existing.productId;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: locked }}
                accessibilityLabel={p.name}
                disabled={locked}
                onPress={() => setProductId(p.id)}
                style={[styles.product, selected && styles.productSelected, locked && styles.locked]}>
                <ProductImage product={p} size={56} />
                <AppText variant="small" align="center" numberOfLines={2} color={selected ? 'primary' : 'text'}>
                  {p.name}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <AppText variant="label">Maximum quantity</AppText>
        <Stepper label="maximum quantity" value={maxQuantity} min={Math.max(1, sold)} max={10_000} onChange={setMaxQuantity} wide />
        <View style={styles.chips}>
          {QUICK_QUANTITIES.filter((q) => q >= sold).map((q) => (
            <Chip key={q} label={String(q)} selected={maxQuantity === q} onPress={() => setMaxQuantity(q)} />
          ))}
        </View>
        <AppText variant="caption" color="textSecondary">
          Ordering stops when this many units are reserved.{sold ? ` ${sold} are already ordered.` : ''}
        </AppText>
      </View>

      <DateTimeField label="Order deadline" helper="Customers can't order after this time." value={deadline} onChange={setDeadline} error={deadlineError && !existing ? deadlineError : null} />
      <DateTimeField label="Collection" helper="Pickup window starts at this time." value={collection} onChange={setCollection} error={collectionError} />

      <Card>
        <AppText variant="subheading">Pickup slots on {formatDay(collection)}</AppText>
        {needsSlots ? (
          <>
            <SlotSetting label="Number of slots" value={slotCount} min={1} max={12} onChange={setSlotCount} />
            <SlotSetting label="Minutes per slot" value={slotMinutes} min={10} max={120} step={5} onChange={setSlotMinutes} />
            <SlotSetting label="Orders per slot" value={slotCapacity} min={1} max={50} onChange={setSlotCapacity} />
            <AppText variant="caption" color="textSecondary">
              Slots are created when you publish: {formatTime(collection)} onwards, {slotCount} × {slotMinutes} min.
            </AppText>
          </>
        ) : (
          <AppText variant="body" color="textSecondary">
            {daySlots.length} slot{daySlots.length === 1 ? '' : 's'} already open from {formatTime(daySlots.sort((a, b) => a.start.localeCompare(b.start))[0].start)}. Manage them in Pickup slots.
          </AppText>
        )}
      </Card>

      <Card tone={shortfalls.length ? 'warning' : 'success'}>
        <AppText variant="subheading">Ingredient check</AppText>
        {shortfalls.length ? (
          <>
            <AppText variant="caption">
              Not enough free stock for all {maxQuantity - sold} units (even mix of options). Restock or lower the quantity:
            </AppText>
            {shortfalls.map((s) => (
              <AppText key={s.ingredientId} variant="caption">
                • {s.name}: need {formatQuantity(s.needed, s.unit)}, have {formatQuantity(s.available, s.unit)}
              </AppText>
            ))}
          </>
        ) : (
          <AppText variant="caption">Enough free stock to make all {maxQuantity - sold} units.</AppText>
        )}
      </Card>

      {product ? (
        <View style={styles.preview}>
          <AppText variant="small" color="textSecondary">
            Customers will see
          </AppText>
          <AppText variant="bodyStrong">
            {product.name} · {maxQuantity - sold} available · Order by {formatDay(deadline)}, {formatTime(deadline)} · Collect {formatDay(collection)} from {formatTime(collection)}
          </AppText>
        </View>
      ) : null}

      {existing?.status === 'published' ? (
        <Banner tone="info" title="This batch is live" message="Changes apply immediately. The collection day cannot move once customers have booked slots." />
      ) : null}
    </Screen>
  );
}

function SlotSetting(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.slotRow}>
      <AppText variant="body" style={styles.flex}>
        {props.label}
      </AppText>
      <Stepper label={props.label} value={props.value} min={props.min} max={props.max} step={props.step} onChange={props.onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  products: { gap: Spacing.two, paddingRight: Spacing.four },
  product: {
    width: 92,
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  productSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  locked: { opacity: 0.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  preview: { backgroundColor: Colors.surface, padding: Spacing.four, borderRadius: Radius.md, gap: Spacing.one },
  footer: { flexDirection: 'row', gap: Spacing.three },
});
