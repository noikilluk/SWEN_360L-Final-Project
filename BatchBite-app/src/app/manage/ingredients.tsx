import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useFeedback } from '@/components/ui/feedback';
import { EmptyState, KeyValue, SectionTitle } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { canOrder } from '@/domain/batch';
import { availableStock, findShortfalls, formatQuantity, isLowStock, mergeLines } from '@/domain/recipe';
import type { Ingredient, IngredientUnit } from '@/domain/types';
import { estimateBatchNeeds } from '@/services/batch-service';
import { useDbState, useNow, useRequiredUser, useServices } from '@/state/app-provider';

const UNITS: IngredientUnit[] = ['g', 'ml', 'pcs'];

/** Ingredient stock, reservations and planning (Sprint 2: ingredient planning and stock reservations). */
export default function IngredientsScreen() {
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const now = useNow();
  const { toast, prompt, confirm, showError } = useFeedback();
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);

  const ingredients = Object.values(state.ingredients).sort((a, b) => Number(isLowStock(b)) - Number(isLowStock(a)) || a.name.localeCompare(b.name));

  // Planning: what is needed if every open batch sells its remaining units.
  const openBatches = Object.values(state.batches).filter((b) => b.status === 'published' && canOrder(b, now));
  const potential = mergeLines(
    openBatches.flatMap((b) => {
      const product = state.products[b.productId];
      return product ? estimateBatchNeeds(product, b.remainingQuantity) : [];
    }),
  );
  const shopping = findShortfalls(potential, state.ingredients);

  const restock = async (ingredient: Ingredient) => {
    const amount = await prompt({
      title: `Adjust ${ingredient.name}`,
      message: `In stock: ${formatQuantity(ingredient.stock, ingredient.unit)}. Enter an amount in ${ingredient.unit} to add, or a negative number to remove.`,
      keyboardType: 'numbers-and-punctuation',
      placeholder: ingredient.unit === 'pcs' ? '24' : '1000',
      confirmLabel: 'Update stock',
      validate: (v) => (Number.isFinite(Number(v)) && Number(v) !== 0 ? null : 'Enter a number such as 500 or -200.'),
    });
    if (amount === null) return;
    try {
      await services.catalogue.adjustStock(user.id, ingredient.id, Number(amount));
      toast(`${ingredient.name} updated`);
    } catch (error) {
      showError(error);
    }
  };

  return (
    <Screen
      header={<ScreenHeader back title="Ingredients" subtitle="Free stock = in stock minus what confirmed orders have reserved" />}
      footer={<Button title="Add ingredient" variant="primary" icon="plus" onPress={() => setEditing('new')} />}>
      <Card tone={shopping.length ? 'warning' : 'success'}>
        <AppText variant="subheading">Shopping list</AppText>
        <AppText variant="caption">
          {openBatches.length
            ? `If all ${openBatches.length} open batch${openBatches.length === 1 ? '' : 'es'} sell out (even mix of options):`
            : 'No batches are taking orders right now.'}
        </AppText>
        {shopping.length
          ? shopping.map((s) => <KeyValue key={s.ingredientId} label={s.name} value={`buy ${formatQuantity(s.missing, s.unit)}`} />)
          : openBatches.length
            ? <AppText variant="bodyStrong">You have enough of everything.</AppText>
            : null}
      </Card>

      <SectionTitle title={`Stock (${ingredients.length})`} />
      {ingredients.length === 0 ? (
        <EmptyState icon="ingredients" title="No ingredients yet" message="Add ingredients, then use them in product recipes." />
      ) : (
        <View style={styles.list}>
          {ingredients.map((ingredient) => {
            const free = availableStock(ingredient);
            const low = isLowStock(ingredient);
            return (
              <Card key={ingredient.id} tone={low ? 'warning' : 'surface'}>
                <View style={styles.row}>
                  <AppText variant="subheading" style={styles.flex}>
                    {ingredient.name}
                  </AppText>
                  {low ? <Badge label="Low stock" tone="warning" /> : null}
                </View>
                <ProgressBar value={ingredient.stock ? free / ingredient.stock : 0} label="Free stock" />
                <View style={styles.row}>
                  <Stat label="In stock" value={formatQuantity(ingredient.stock, ingredient.unit)} />
                  <Stat label="Reserved" value={formatQuantity(ingredient.reserved, ingredient.unit)} />
                  <Stat label="Free" value={formatQuantity(Math.max(0, free), ingredient.unit)} />
                </View>
                <AppText variant="small" color="textMuted">
                  Warn below {formatQuantity(ingredient.lowStockThreshold, ingredient.unit)} · {(ingredient.costPerUnit * (ingredient.unit === 'pcs' ? 1 : 1000) / 1000).toFixed(3)} BD per {ingredient.unit === 'pcs' ? 'piece' : ingredient.unit === 'g' ? 'kg' : 'L'}
                  {ingredient.allergens.length ? ` · ${ingredient.allergens.join(', ')}` : ''}
                </AppText>
                <View style={styles.actions}>
                  <Button title="Adjust stock" size="sm" variant="primary" onPress={() => restock(ingredient)} />
                  <Button title="Edit" size="sm" onPress={() => setEditing(ingredient)} />
                  <Button
                    title="Delete"
                    size="sm"
                    variant="ghost"
                    onPress={async () => {
                      const ok = await confirm({ title: `Delete ${ingredient.name}?`, confirmLabel: 'Delete', destructive: true });
                      if (ok) services.catalogue.deleteIngredient(user.id, ingredient.id).then(() => toast('Ingredient deleted')).catch(showError);
                    }}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {editing ? <IngredientSheet ingredient={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="small" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

/** Add or edit an ingredient. Cost is entered per kg / L / piece for convenience. */
function IngredientSheet({ ingredient, onClose }: { ingredient?: Ingredient; onClose: () => void }) {
  const user = useRequiredUser();
  const services = useServices();
  const insets = useSafeAreaInsets();
  const { toast, showError } = useFeedback();
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState<IngredientUnit>(ingredient?.unit ?? 'g');
  const [stock, setStock] = useState(String(ingredient?.stock ?? ''));
  const [threshold, setThreshold] = useState(String(ingredient?.lowStockThreshold ?? ''));
  const perBulk = unit === 'pcs' ? 1 : 1000;
  const [cost, setCost] = useState(ingredient ? String((ingredient.costPerUnit * perBulk) / 1000) : '');
  const [allergens, setAllergens] = useState(ingredient?.allergens.join(', ') ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const input = {
        name,
        unit,
        stock: Number(stock || 0),
        lowStockThreshold: Number(threshold || 0),
        // Cost is typed in BD per kg / L / piece and stored in fils per g / ml / piece.
        costPerUnit: (Number(cost || 0) * 1000) / perBulk,
        allergens: allergens.split(','),
      };
      if (ingredient) await services.catalogue.updateIngredient(user.id, ingredient.id, input);
      else await services.catalogue.createIngredient(user.id, input);
      toast(ingredient ? 'Ingredient saved' : 'Ingredient added');
      onClose();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            <AppText variant="heading">{ingredient ? `Edit ${ingredient.name}` : 'New ingredient'}</AppText>
            <TextField label="Name" value={name} onChangeText={setName} maxLength={40} />
            <View style={styles.units}>
              {UNITS.map((u) => (
                <Chip key={u} label={u === 'pcs' ? 'pieces' : u} selected={unit === u} onPress={() => setUnit(u)} />
              ))}
            </View>
            <TextField label={`In stock (${unit})`} value={stock} onChangeText={setStock} keyboardType="decimal-pad" />
            <TextField label={`Warn when free stock is below (${unit})`} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" />
            <TextField label={`Cost in BD per ${unit === 'pcs' ? 'piece' : unit === 'g' ? 'kg' : 'litre'}`} value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
            <TextField label="Allergens" placeholder="For example: Gluten, Milk" value={allergens} onChangeText={setAllergens} helper="Separate with commas. Customers see these on the item page." />
            <View style={styles.actions}>
              <Button title="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
              <Button title="Save" variant="primary" onPress={save} loading={busy} style={styles.flex} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  stat: { flex: 1, gap: Spacing.half },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  sheetContent: { padding: Spacing.four, gap: Spacing.three },
  units: { flexDirection: 'row', gap: Spacing.two },
});
