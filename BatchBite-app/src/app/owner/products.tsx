import { router } from 'expo-router';
import { StyleSheet, Switch, View } from 'react-native';

import { HeaderActions } from '@/components/header-actions';
import { ProductImage } from '@/components/product-image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFeedback } from '@/components/ui/feedback';
import { EmptyState } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { formatMoney } from '@/domain/money';
import { linesCost, unitRecipe } from '@/domain/recipe';
import { useDbState, useRequiredUser, useServices } from '@/state/app-provider';

/** Product listings (FR-02). Only business owners can manage products. */
export default function OwnerProducts() {
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const { toast, showError } = useFeedback();
  const products = Object.values(state.products).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Screen
      inTabs
      header={<ScreenHeader title="Products" right={<HeaderActions />} />}
      footer={<Button title="New product" variant="primary" icon="plus" onPress={() => router.push({ pathname: '/manage/product/[id]', params: { id: 'new' } })} />}>
      {products.length === 0 ? (
        <EmptyState icon="product" title="No products yet" message="Add what you sell, with its price, options and recipe." />
      ) : (
        <View style={styles.list}>
          {products.map((product) => {
            const cost = product.variants.length
              ? Math.round(product.variants.reduce((s, v) => s + linesCost(unitRecipe(product, v.id), state.ingredients), 0) / product.variants.length)
              : linesCost(product.recipe, state.ingredients);
            return (
              <Card key={product.id} onPress={() => router.push({ pathname: '/manage/product/[id]', params: { id: product.id } })}>
                <View style={styles.row}>
                  <ProductImage product={product} size={64} dimmed={!product.active} />
                  <View style={styles.flex}>
                    <View style={styles.row}>
                      <AppText variant="subheading" style={styles.flex}>
                        {product.name}
                      </AppText>
                      <AppText variant="subheading">{formatMoney(product.price)}</AppText>
                    </View>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {product.variants.map((v) => v.name).join(' · ')}
                    </AppText>
                    <View style={styles.row}>
                      <Badge label={`v${product.version}`} tone="primary" />
                      <Badge label={`Ingredients ≈ ${formatMoney(cost)}`} />
                      {!product.active ? <Badge label="Hidden" tone="danger" /> : null}
                    </View>
                  </View>
                </View>
                <View style={styles.row}>
                  <AppText variant="caption" style={styles.flex}>
                    Visible to customers
                  </AppText>
                  <Switch
                    accessibilityLabel={`Show ${product.name} to customers`}
                    value={product.active}
                    trackColor={{ true: Colors.primary, false: Colors.track }}
                    thumbColor={Colors.background}
                    onValueChange={(active) =>
                      services.catalogue
                        .setProductActive(user.id, product.id, active)
                        .then(() => toast(active ? `${product.name} is visible` : `${product.name} is hidden`))
                        .catch(showError)
                    }
                  />
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
  list: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0, gap: Spacing.half },
});
