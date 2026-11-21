import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFeedback } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { notificationsFor } from '@/data/selectors';
import { formatAgo } from '@/domain/time';
import type { AppNotification, NotificationKind } from '@/domain/types';
import { useDbState, useNow, useRequiredUser, useServices } from '@/state/app-provider';
import { HOME_HREF } from '@/state/navigation';

const ICONS: Record<NotificationKind, IconName> = {
  order_confirmed: 'checkCircle',
  new_order: 'orders',
  order_preparing: 'kitchen',
  order_ready: 'box',
  order_delayed: 'timer',
  order_missed: 'warning',
  order_collected: 'verified',
  order_cancelled: 'close',
  refund_issued: 'payment',
  change_requested: 'edit',
  change_resolved: 'edit',
  task_assigned: 'tasks',
  low_stock: 'ingredients',
  password_reset_requested: 'key',
};

/** Notification inbox for every role (confirmation, ready, delay, missed collection, staff alerts). */
export default function NotificationsScreen() {
  const user = useRequiredUser();
  const state = useDbState();
  const services = useServices();
  const now = useNow();
  const { showError } = useFeedback();
  const items = notificationsFor(state, user.id);
  const unread = items.filter((n) => !n.read).length;

  const open = async (notification: AppNotification) => {
    try {
      await services.notifications.markRead(user.id, notification.id);
    } catch (error) {
      showError(error);
    }
    if (notification.orderId && state.orders[notification.orderId]) {
      router.push({ pathname: '/order/[id]', params: { id: notification.orderId } });
    } else if (notification.kind === 'low_stock') {
      router.push('/manage/ingredients');
    } else if (notification.kind === 'task_assigned') {
      router.push(user.role === 'kitchen' ? '/kitchen/tasks' : '/manage/tasks');
    } else if (notification.kind === 'password_reset_requested') {
      router.push(HOME_HREF.admin);
    }
  };

  return (
    <Screen header={<ScreenHeader back title="Notifications" subtitle={unread ? `${unread} unread` : 'All caught up'} />}>
      {items.length > 0 ? (
        <View style={styles.actions}>
          <Button title="Mark all read" size="sm" variant="soft" icon="check" disabled={!unread} onPress={() => services.notifications.markAllRead(user.id).catch(showError)} />
          <Button title="Clear read" size="sm" variant="ghost" icon="trash" onPress={() => services.notifications.clearRead(user.id).catch(showError)} />
        </View>
      ) : null}
      {items.length === 0 ? (
        <EmptyState icon="bell" title="No notifications" message="Updates about orders and tasks will appear here." />
      ) : (
        <View style={styles.list}>
          {items.map((notification) => (
            <Card
              key={notification.id}
              tone={notification.read ? 'outline' : 'primary'}
              onPress={() => open(notification)}
              accessibilityLabel={`${notification.read ? '' : 'Unread. '}${notification.title}. ${notification.body}`}
              style={styles.item}>
              <View style={styles.icon}>
                <Icon name={ICONS[notification.kind]} size={20} color={Colors.primary} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{notification.title}</AppText>
                <AppText variant="caption">{notification.body}</AppText>
                <AppText variant="small" color="textMuted">
                  {formatAgo(notification.createdAt, now)}
                </AppText>
              </View>
              {!notification.read ? <View style={styles.dot} /> : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.two },
  list: { gap: Spacing.two },
  item: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start', padding: Spacing.three },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: Spacing.half, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginTop: 6 },
});
