import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

import { Icon } from './icon';
import { AppText } from './text';

export interface ScreenProps {
  children: ReactNode;
  /** Header shown above the scrolling content. */
  header?: ReactNode;
  /** Content pinned to the bottom (for example the Add to cart button). */
  footer?: ReactNode;
  scroll?: boolean;
  /** Set on screens shown inside tabs so the tab bar handles the bottom inset. */
  inTabs?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * Standard page: safe areas, white background, keyboard avoidance and a
 * phone-width column that stays centred on tablets and the web.
 */
export function Screen({ children, header, footer, scroll = true, inTabs, contentStyle, onRefresh, refreshing }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const body = (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header ? <View style={styles.column}>{header}</View> : null}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: footer || inTabs ? Spacing.five : insets.bottom + Spacing.five }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={Colors.primary} /> : undefined}>
            <View style={styles.column}>{body}</View>
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.column]}>{body}</View>
        )}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: inTabs ? Spacing.three : insets.bottom + Spacing.three }]}>
            <View style={styles.column}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /** Shows the purple back arrow from the wireframes. */
  back?: boolean;
  /** Where to go if there is no history (for example after a deep link). */
  fallbackHref?: Parameters<typeof router.replace>[0];
  right?: ReactNode;
  left?: ReactNode;
  large?: boolean;
}

export function ScreenHeader({ title, subtitle, back, fallbackHref, right, left, large }: ScreenHeaderProps) {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (fallbackHref) router.replace(fallbackHref);
    else router.replace('/');
  };
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} hitSlop={12} style={styles.back}>
            <Icon name="back" size={28} color={Colors.primary} />
          </Pressable>
        ) : null}
        {left}
        <View style={styles.headerTitle}>
          {title ? (
            <AppText variant={large ? 'display' : 'title'} accessibilityRole="header" numberOfLines={2}>
              {title}
            </AppText>
          ) : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
      {subtitle ? (
        <AppText variant="body" color="textSecondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: Spacing.four, gap: Spacing.four, flexGrow: 1 },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.one },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 44 },
  back: { paddingRight: Spacing.one },
  headerTitle: { flex: 1, minWidth: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
