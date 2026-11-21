import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import type { Product } from '@/domain/types';

import { AppText } from './ui/text';

/** Soft background colours so placeholder emojis look intentional. */
const TINTS = ['#F6EAFD', '#FFF3DC', '#E7F7EF', '#FDE9EC', '#E8F0FC'];

function tintFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/** Product photo, or the product's emoji on a tinted tile when there is no photo. */
export function ProductImage({
  product,
  size,
  style,
  dimmed,
}: {
  product: Pick<Product, 'id' | 'name' | 'emoji' | 'photoUri'>;
  /** Square size in points. Leave out to fill the parent width (4:3). */
  size?: number;
  style?: StyleProp<ViewStyle>;
  dimmed?: boolean;
}) {
  const box: StyleProp<ViewStyle> = size ? { width: size, height: size } : styles.fill;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Photo of ${product.name}`}
      style={[styles.base, box, { backgroundColor: tintFor(product.id) }, dimmed && styles.dimmed, style]}>
      {product.photoUri ? (
        <Image source={{ uri: product.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <AppText style={{ fontSize: size ? size * 0.5 : 84, lineHeight: size ? size * 0.62 : 100 }}>{product.emoji}</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fill: { width: '100%', aspectRatio: 4 / 3 },
  dimmed: { opacity: 0.45 },
});
