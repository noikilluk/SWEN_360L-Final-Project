import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BADGE_INFO } from '@/components/batch-card';
import { HeaderActions } from '@/components/header-actions';
import { ProductImage } from '@/components/product-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Collapsible } from '@/components/ui/collapsible';
import { useFeedback } from '@/components/ui/feedback';
import { EmptyState } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { AppText } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { batchBadges, canOrder, findNextBatch, isSoldOut, remainingRatio } from '@/domain/batch';
import { AppError } from '@/domain/errors';
import { formatMoney } from '@/domain/money';
import { unitRecipe } from '@/domain/recipe';
import { formatDateTime, formatDay, formatRelativeDateTime, formatTime } from '@/domain/time';
import { MAX_UNITS_PER_LINE } from '@/services/cart-service';
import { useCurrentUser, useDbState, useNow, useServices } from '@/state/app-provider';
import { HOME_HREF } from '@/state/navigation';

/** Item page (wireframe 5.4, US-02, US-03, FR-04). */
export default function BatchItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useDbState();
  const user = useCurrentUser();
  const services = useServices();
  const now = useNow();
  const { toast, confirm, showError } = useFeedback();
  const batch = state.batches[id];
  const product = batch ? state.products[batch.productId] : undefined;
  const [variantId, setVariantId] = useState<string | undefined>(product?.variants[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  if (!batch || !product || batch.status === 'draft') {
    return (
      <Screen header={<ScreenHeader back fallbackHref={HOME_HREF.customer} />}>
        <EmptyState icon="product" title="This batch is no longer available" actionLabel="Back to batches" onAction={() => router.replace(HOME_HREF.customer)} />
      </Screen>
    );
  }

  const orderable = canOrder(batch, now);
  const soldOut = isSoldOut(batch);
  const next = !orderable ? findNextBatch(batch, Object.values(state.batches), now) : undefined;
  const maxQuantity = Math.max(1, Math.min(batch.remainingQuantity, MAX_UNITS_PER_LINE));
  const qty = Math.min(quantity, maxQuantity);
  const selectedVariant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const badges = batchBadges(batch, now, state.settings);

  const recipe = selectedVariant ? unitRecipe(product, selectedVariant.id) : product.recipe;
  const ingredientNames = recipe.map((line) => state.ingredients[line.ingredientId]?.name).filter(Boolean);
  const allergens = [...new Set(recipe.flatMap((line) => state.ingredients[line.ingredientId]?.allergens ?? []))].sort();

  const addToCart = async (replaceCart = false) => {
    if (!user || !selectedVariant) return;
    setBusy(true);
    try {
      await services.cart.addItem(user.id, batch.id, selectedVariant.id, qty, { replaceCart });
      toast(`Added ${qty} × ${product.name} to your cart`);
      setQuantity(1);
    } catch (error) {
      if (error instanceof AppError && error.code === 'CART_DATE_CONFLICT') {
        const ok = await confirm({
          title: 'Start a new cart?',
          message: `${error.message} Replace your cart with ${product.name}?`,
          confirmLabel: 'Replace cart',
        });
        if (ok) await addToCart(true);
      } else {
        showError(error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<ScreenHeader back fallbackHref={HOME_HREF.customer} right={<HeaderActions showCart />} />}
      footer={
        <View style={styles.footer}>
          {!orderable ? (
            <AppText variant="caption" color="textSecondary" align="center">
              {soldOut ? 'This batch is sold out.' : 'Ordering for this batch has closed.'}{' '}
              {next ? `Next batch: ${formatDay(next.collectionStart)}.` : ''}
            </AppText>
          ) : null}
          <Button
            title={`Add to cart | ${formatMoney(product.price * qty)}`}
            onPress={() => addToCart()}
            disabled={!orderable}
            loading={busy}
            testID="add-to-cart"
          />
          {next ? (
            <Button
              title={`View the ${formatDay(next.collectionStart)} batch`}
              variant="ghost"
              size="sm"
              onPress={() => router.replace({ pathname: '/batch/[id]', params: { id: next.id } })}
            />
          ) : null}
        </View>
      }>
      <ProductImage product={product} dimmed={!orderable} />

      <View style={styles.titleBlock}>
        <View style={styles.row}>
          <AppText variant="title" style={styles.flex}>
            {product.name}
          </AppText>
          <AppText variant="title">{formatMoney(product.price)}</AppText>
        </View>
        <AppText variant="body">{product.description}</AppText>
        {badges.length ? (
          <View style={styles.badges}>
            {badges.map((badge) => (
              <Badge key={badge} {...BADGE_INFO[badge]} />
            ))}
          </View>
        ) : null}
      </View>

      <Card style={styles.stock}>
        <View style={styles.row}>
          <AppText variant="heading" style={styles.flex}>
            {batch.remainingQuantity} of {batch.maxQuantity} left
          </AppText>
          <AppText variant="caption" align="right" style={styles.deadline}>
            {orderable
              ? `Closes ${formatRelativeDateTime(batch.orderDeadline, now)}`
              : next
                ? `Next batch ${formatDay(next.collectionStart)}`
                : `Closed ${formatDateTime(batch.orderDeadline)}`}
          </AppText>
        </View>
        <ProgressBar value={remainingRatio(batch)} height={10} label={`${batch.remainingQuantity} of ${batch.maxQuantity} left`} />
        <AppText variant="caption" color="textSecondary">
          Collect on {formatDay(batch.collectionStart)} from {formatTime(batch.collectionStart)}
        </AppText>
      </Card>

      <View style={styles.variants} accessibilityRole="radiogroup" accessibilityLabel="Options">
        {product.variants.map((variant) => (
          <Chip
            key={variant.id}
            label={variant.name}
            selected={variant.id === selectedVariant?.id}
            onPress={() => setVariantId(variant.id)}
          />
        ))}
      </View>

      <View style={styles.row}>
        <AppText variant="label" style={styles.flex}>
          Quantity
        </AppText>
        <Stepper label="quantity" value={qty} min={1} max={maxQuantity} onChange={setQuantity} />
      </View>

      <Collapsible title="Ingredients and allergens">
        <AppText variant="body">{ingredientNames.length ? ingredientNames.join(', ') : 'Ingredient list coming soon.'}</AppText>
        <AppText variant="bodyStrong">
          {allergens.length ? `Contains: ${allergens.join(', ')}` : 'No major allergens listed.'}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          Made in a kitchen that also handles nuts, gluten, milk and eggs.
        </AppText>
      </Collapsible>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.one },
  stock: { gap: Spacing.three },
  deadline: { maxWidth: '55%' },
  variants: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  footer: { gap: Spacing.two },
});
