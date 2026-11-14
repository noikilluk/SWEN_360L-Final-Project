/**
 * BatchBite design tokens, taken from the Phase 1 design document:
 * - #7E00CC purple for the logo, outlines, confirmation buttons, chips and progress bars
 * - #FFFFFF background, #000000 text
 * - #F3F3F3 cells and search bar, #D9D9D9 progress bar track
 * - #EFD87D "Closing soon" labels, #58CA99 "Pickup today" labels
 * - Rethink Sans for all text
 */
import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  primary: '#7E00CC',
  primaryPressed: '#6200A0',
  primarySoft: '#F4E8FC',
  primaryMuted: '#C9A3E6',
  background: '#FFFFFF',
  surface: '#F3F3F3',
  surfaceStrong: '#E9E9EC',
  track: '#D9D9D9',
  border: '#E2E2E6',
  text: '#000000',
  textSecondary: '#55555F',
  textMuted: '#85858F',
  inverse: '#FFFFFF',
  warning: '#EFD87D',
  warningText: '#4D3D00',
  success: '#58CA99',
  successSoft: '#E3F6EC',
  successText: '#0B4A2F',
  danger: '#C62E2E',
  dangerSoft: '#FCEBEB',
  info: '#E6EEFB',
  infoText: '#1F4A87',
  overlay: 'rgba(0,0,0,0.45)',
} as const;

export type ColorName = keyof typeof Colors;

/** Rethink Sans faces loaded in the root layout. Android needs one family per weight. */
export const Fonts = {
  regular: 'RethinkSans_400Regular',
  medium: 'RethinkSans_500Medium',
  semibold: 'RethinkSans_600SemiBold',
  bold: 'RethinkSans_700Bold',
  extrabold: 'RethinkSans_800ExtraBold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, monospace' }),
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Content is centred and capped at phone width on tablets and the web. */
export const MaxContentWidth = 560;

export const Shadow = Platform.select({
  web: { boxShadow: '0 4px 18px rgba(0,0,0,0.08)' },
  default: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
