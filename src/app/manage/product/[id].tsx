import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ProductImage } from '@/components/product-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';
import { useFeedback } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/icon';
import { Divider, KeyValue, SectionTitle } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { SelectSheet } from '@/components/ui/select-sheet';
import { AppText } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { filsToInput, formatMoney, parseMoney } from '@/domain/money';
import { linesCost, unitRecipe } from '@/domain/recipe';
import { formatDateTime } from '@/domain/time';
import type { ID, RecipeLine } from '@/domain/types';
import { MAX_PHOTO_LENGTH, NEW_VARIANT_PREFIX } from '@/services/catalogue-service';
import { useDbState, useRequiredUser, useServices } from '@/state/app-provider';

const EMOJIS = ['🍰', '🍫', '🧁', '🍪', '🍩', '🥐', '🎂', '🥧', '🍞', '🧇', '🍮', '🥨'];

interface LineDraft {
  key: string;
  ingredientId: ID;
  quantity: string;
}

let draftCounter = 0;
const draftKey = () => `d${++draftCounter}`;

const toDrafts = (lines: RecipeLine[]): LineDraft[] => lines.map((l) => ({ key: draftKey(), ingredientId: l.ingredientId, quantity: String(l.quantity) }));
const fromDrafts = (drafts: LineDraft[]): RecipeLine[] =>
  drafts.filter((d) => d.ingredientId).map((d) => ({ ingredientId: d.ingredientId, quantity: Number(d.quantity.replace(',', '.')) }));

/** Product editor: details, options, recipe and version history (FR-02, Sprint 2 versioning). */
export default function ProductEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const { toast, showError } = useFeedback();
  const existing = id !== 'new' ? state.products[id] : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [price, setPrice] = useState(existing ? filsToInput(existing.price) : '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🧁');
  const [photoUri, setPhotoUri] = useState(existing?.photoUri);
  const [variants, setVariants] = useState(existing?.variants ?? [{ id: `${NEW_VARIANT_PREFIX}1`, name: 'Classic' }]);
  const [recipe, setRecipe] = useState<LineDraft[]>(() => toDrafts(existing?.recipe ?? []));
  const [variantRecipes, setVariantRecipes] = useState<Record<ID, LineDraft[]>>(() =>
    Object.fromEntries(Object.entries(existing?.variantRecipes ?? {}).map(([k, v]) => [k, toDrafts(v)])),
  );
  const [changeNote, setChangeNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<{ target: 'base' | ID; key: string } | null>(null);

  const ingredients = Object.values(state.ingredients).sort((a, b) => a.name.localeCompare(b.name));
  const versions = existing
    ? Object.values(state.productVersions).filter((v) => v.productId === existing.id).sort((a, b) => b.version - a.version)
    : [];
  const priceFils = parseMoney(price);

  const previewSource = { recipe: fromDrafts(recipe), variantRecipes: Object.fromEntries(Object.entries(variantRecipes).map(([k, v]) => [k, fromDrafts(v)])) };
  const unitCosts = variants.map((v) => linesCost(unitRecipe(previewSource, v.id), state.ingredients));
  const averageCost = unitCosts.length ? Math.round(unitCosts.reduce((a, b) => a + b, 0) / unitCosts.length) : 0;

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.35, base64: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const uri = asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : asset.uri;
      if (uri.length > MAX_PHOTO_LENGTH) {
        showError(new Error('That photo is too large. Crop it or choose a smaller one.'));
        return;
      }
      setPhotoUri(uri);
    } catch (error) {
      showError(error);
    }
  };

  const updateLines = (target: 'base' | ID, update: (lines: LineDraft[]) => LineDraft[]) => {
    if (target === 'base') setRecipe(update);
    else setVariantRecipes((current) => ({ ...current, [target]: update(current[target] ?? []) }));
  };

  const save = async () => {
    if (priceFils === null) {
      showError(new Error('Enter a price such as 4.50.'));
      return;
    }
    setBusy(true);
    try {
      const input = {
        name,
        description,
        price: priceFils,
        emoji,
        photoUri,
        variants,
        recipe: fromDrafts(recipe),
        variantRecipes: previewSource.variantRecipes,
        changeNote,
      };
      if (existing) {
        const { product, newVersion } = await services.catalogue.updateProduct(user.id, existing.id, input);
        toast(newVersion ? `Saved as version ${product.version}. Existing orders keep their old price.` : 'Saved');
      } else {
        await services.catalogue.createProduct(user.id, input);
        toast('Product added');
      }
      router.back();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const renderLines = (target: 'base' | ID, lines: LineDraft[]) => (
    <View style={styles.lines}>
      {lines.map((line) => {
        const ingredient = state.ingredients[line.ingredientId];
        return (
          <View key={line.key} style={styles.lineRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ingredient: ${ingredient?.name ?? 'choose'}`}
              onPress={() => setPicking({ target, key: line.key })}
              style={styles.ingredientButton}>
              <AppText variant="body" numberOfLines={1} style={styles.flex}>
                {ingredient?.name ?? 'Choose ingredient'}
              </AppText>
              <Icon name="chevronDown" size={16} color={Colors.primary} />
            </Pressable>
            <TextInput
              value={line.quantity}
              onChangeText={(quantity) => updateLines(target, (ls) => ls.map((l) => (l.key === line.key ? { ...l, quantity } : l)))}
              keyboardType="decimal-pad"
              accessibilityLabel={`Amount of ${ingredient?.name ?? 'ingredient'}`}
              style={styles.qty}
            />
            <AppText variant="caption" color="textSecondary" style={styles.unit}>
              {ingredient?.unit ?? ''}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Remove ingredient" hitSlop={8} onPress={() => updateLines(target, (ls) => ls.filter((l) => l.key !== line.key))}>
              <Icon name="close" size={18} color={Colors.textSecondary} />
            </Pressable>
          </View>
        );
      })}
      <Button
        title="Add ingredient"
        size="sm"
        variant="ghost"
        icon="plus"
        disabled={ingredients.length === 0}
        onPress={() => {
          const key = draftKey();
          updateLines(target, (ls) => [...ls, { key, ingredientId: '', quantity: '' }]);
          setPicking({ target, key });
        }}
      />
    </View>
  );

  return (
    <Screen
      header={<ScreenHeader back title={existing ? 'Edit product' : 'New product'} right={existing ? <Badge label={`v${existing.version}`} tone="primary" /> : undefined} />}
      footer={<Button title={existing ? 'Save changes' : 'Add product'} variant="primary" onPress={save} loading={busy} />}>
      <ProductImage product={{ id: existing?.id ?? 'new', name: name || 'New product', emoji, photoUri }} />
      <View style={styles.photoActions}>
        <Button title={photoUri ? 'Change photo' : 'Add photo'} size="sm" icon="addPhoto" onPress={pickPhoto} />
        {photoUri ? <Button title="Remove photo" size="sm" variant="ghost" onPress={() => setPhotoUri(undefined)} /> : null}
      </View>
      {!photoUri ? (
        <View style={styles.emojis}>
          {EMOJIS.map((e) => (
            <Pressable key={e} accessibilityRole="button" accessibilityLabel={`Use ${e} as the picture`} onPress={() => setEmoji(e)} style={[styles.emoji, emoji === e && styles.emojiSelected]}>
              <AppText style={styles.emojiText}>{e}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <TextField label="Name" placeholder="For example: Dessert box" value={name} onChangeText={setName} maxLength={40} />
      <TextField label="Description" placeholder="Shown on the item page" value={description} onChangeText={setDescription} multiline maxLength={240} />
      <TextField
        label="Price (BD)"
        placeholder="4.50"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        error={price && priceFils === null ? 'Enter a price such as 4.50.' : null}
        helper={priceFils ? `Ingredients cost about ${formatMoney(averageCost)} per unit.` : undefined}
      />

      <View style={styles.section}>
        <SectionTitle title="Options" />
        <AppText variant="caption" color="textSecondary">
          Flavours or styles customers choose from. At least one is needed.
        </AppText>
        {variants.map((variant, index) => (
          <View key={variant.id} style={styles.variantRow}>
            <View style={styles.flex}>
              <TextField
                value={variant.name}
                placeholder={`Option ${index + 1}`}
                onChangeText={(text) => setVariants((vs) => vs.map((v) => (v.id === variant.id ? { ...v, name: text } : v)))}
                maxLength={30}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove option ${variant.name}`}
              disabled={variants.length === 1}
              hitSlop={8}
              onPress={() => setVariants((vs) => vs.filter((v) => v.id !== variant.id))}
              style={variants.length === 1 && styles.disabled}>
              <Icon name="trash" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
        ))}
        <Button title="Add option" size="sm" variant="ghost" icon="plus" onPress={() => setVariants((vs) => [...vs, { id: `${NEW_VARIANT_PREFIX}${Date.now()}`, name: '' }])} />
      </View>

      <View style={styles.section}>
        <SectionTitle title="Recipe for one unit" />
        <AppText variant="caption" color="textSecondary">
          Used to reserve stock for each order and to plan ingredients. Customers see these ingredients and their allergens.
        </AppText>
        {renderLines('base', recipe)}
        {variants.map((variant) => (
          <Collapsible key={variant.id} title={`Extra for ${variant.name || 'this option'} (${(variantRecipes[variant.id] ?? []).length})`}>
            {renderLines(variant.id, variantRecipes[variant.id] ?? [])}
          </Collapsible>
        ))}
      </View>

      {existing ? (
        <TextField
          label="What changed? (optional)"
          placeholder="For example: new supplier for butter"
          value={changeNote}
          onChangeText={setChangeNote}
          helper="Changing the price, name, options or recipe creates a new version. Orders already placed keep the version they were bought with."
        />
      ) : null}

      {versions.length ? (
        <Card>
          <AppText variant="subheading">Version history</AppText>
          {versions.map((version, index) => (
            <View key={version.id}>
              {index > 0 ? <Divider /> : null}
              <KeyValue label={`v${version.version} · ${formatDateTime(version.createdAt)}`} value={formatMoney(version.price)} />
              <AppText variant="small" color="textSecondary">
                {version.changeNote}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {picking ? (
        <SelectSheet
          title="Choose ingredient"
          options={ingredients.map((i) => ({ key: i.id, label: i.name, detail: `per ${i.unit}${i.allergens.length ? ` · contains ${i.allergens.join(', ')}` : ''}` }))}
          selectedKey={(picking.target === 'base' ? recipe : (variantRecipes[picking.target] ?? [])).find((l) => l.key === picking.key)?.ingredientId}
          onSelect={(ingredientId) => {
            updateLines(picking.target, (ls) => ls.map((l) => (l.key === picking.key ? { ...l, ingredientId } : l)));
            setPicking(null);
          }}
          onClose={() => {
            updateLines(picking.target, (ls) => ls.filter((l) => l.key !== picking.key || l.ingredientId));
            setPicking(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoActions: { flexDirection: 'row', gap: Spacing.two },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  emoji: { width: 46, height: 46, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  emojiSelected: { borderWidth: 2, borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  emojiText: { fontSize: 24, lineHeight: 30 },
  section: { gap: Spacing.two },
  variantRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.3 },
  lines: { gap: Spacing.two },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  ingredientButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1.2,
    borderColor: Colors.primaryMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
  },
  qty: {
    width: 72,
    borderWidth: 1.2,
    borderColor: Colors.primaryMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.two,
    minHeight: 44,
    fontFamily: Fonts.regular,
    fontSize: 15,
    textAlign: 'right',
    color: Colors.text,
  },
  unit: { width: 28 },
});
