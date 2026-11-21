/**
 * Small layout helpers: empty states, list rows, section titles, key/value
 * rows, switches and inline banners.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { AppText } from './text';

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={32} color={Colors.primary} />
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" color="textSecondary" align="center">
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} style={styles.emptyButton} /> : null}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
        {title}
      </AppText>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <AppText variant="label" color="primary">
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger,
  badge,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  badge?: number;
}) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, danger && { backgroundColor: Colors.dangerSoft }]}>
          <Icon name={icon} size={20} color={danger ? Colors.danger : Colors.primary} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={danger ? 'danger' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {badge ? <CountBadge count={badge} /> : null}
      {right}
      {onPress && !right ? <Icon name="chevronRight" size={18} color={Colors.textMuted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function CountBadge({ count, small }: { count: number; small?: boolean }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.count, small && styles.countSmall]}>
      <AppText variant="small" color="inverse" style={small ? styles.countSmallText : undefined}>
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}

export function KeyValue({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <View style={styles.kv}>
      <AppText variant={strong ? 'bodyStrong' : 'body'} color={strong ? 'text' : 'textSecondary'} style={styles.flex}>
        {label}
      </AppText>
      {typeof value === 'string' || typeof value === 'number' ? (
        <AppText variant={strong ? 'bodyStrong' : 'body'}>{value}</AppText>
      ) : (
        value
      )}
    </View>
  );
}

export function SwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: Colors.primary, false: Colors.track }}
        thumbColor={Colors.background}
      />
    </View>
  );
}

export function Banner({
  tone,
  icon,
  title,
  message,
  action,
  onAction,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success' | 'primary';
  icon?: IconName;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  const palette = BANNER_TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.background, borderColor: palette.border }]} accessibilityRole="alert">
      <Icon name={icon ?? (tone === 'success' ? 'checkCircle' : tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : 'info')} size={20} color={palette.text} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" style={{ color: palette.text }}>
          {title}
        </AppText>
        {message ? (
          <AppText variant="caption" style={{ color: palette.text }}>
            {message}
          </AppText>
        ) : null}
        {action && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={styles.bannerAction}>
            <AppText variant="label" style={{ color: palette.text, textDecorationLine: 'underline' }}>
              {action}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const BANNER_TONES = {
  info: { background: Colors.info, border: '#C9D9F5', text: Colors.infoText },
  warning: { background: '#FBF4D8', border: Colors.warning, text: Colors.warningText },
  danger: { background: Colors.dangerSoft, border: '#F2C4C4', text: Colors.danger },
  success: { background: Colors.successSoft, border: '#B9E8D0', text: Colors.successText },
  primary: { background: Colors.primarySoft, border: '#E3CCF5', text: Colors.primary },
};

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six, paddingHorizontal: Spacing.four },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  emptyButton: { marginTop: Spacing.three, alignSelf: 'stretch' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 52,
  },
  pressed: { opacity: 0.6 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countSmall: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4 },
  countSmallText: { fontSize: 10, lineHeight: 12 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.one },
  banner: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  bannerAction: { marginTop: Spacing.one },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: Spacing.one },
});
