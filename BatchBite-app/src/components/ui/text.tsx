import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, type ColorName, Fonts } from '@/constants/theme';

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'small'
  | 'mono';

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: ColorName;
  align?: 'left' | 'center' | 'right';
};

/** Text in Rethink Sans with the BatchBite type scale. */
export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  return (
    <Text
      style={[styles[variant], { color: Colors[color] }, align ? { textAlign: align } : null, style]}
      maxFontSizeMultiplier={1.6}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  display: { fontFamily: Fonts.bold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: Fonts.bold, fontSize: 22, lineHeight: 28 },
  heading: { fontFamily: Fonts.semibold, fontSize: 18, lineHeight: 24 },
  subheading: { fontFamily: Fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: Fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: Fonts.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: Fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: Fonts.medium, fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: Fonts.mono, fontSize: 15, lineHeight: 22, letterSpacing: 2 },
});
