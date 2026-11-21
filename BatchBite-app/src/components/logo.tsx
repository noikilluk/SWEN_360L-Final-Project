import { StyleSheet, View } from 'react-native';

import { Colors, Fonts, Radius } from '@/constants/theme';

import { AppText } from './ui/text';

/** The BatchBite wordmark: white text on a purple rounded block. */
export function Logo({ size = 'large' }: { size?: 'large' | 'small' }) {
  const large = size === 'large';
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="BatchBite"
      style={[styles.block, large ? styles.large : styles.small]}>
      <AppText style={[styles.text, { fontSize: large ? 40 : 20, lineHeight: large ? 48 : 26 }]} color="inverse">
        BatchBite
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  large: { borderRadius: Radius.xl, paddingVertical: 22, alignSelf: 'stretch' },
  small: { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start' },
  text: { fontFamily: Fonts.medium },
});
