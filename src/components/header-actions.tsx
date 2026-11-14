import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { cartUnitCount, unreadNotificationCount } from '@/data/selectors';
import { useCurrentUser, useDbState } from '@/state/app-provider';

import { Icon } from './ui/icon';
import { CountBadge } from './ui/misc';

/** Notification bell (all roles) and cart (customers) with counts. */
export function HeaderActions({ showCart }: { showCart?: boolean }) {
  const state = useDbState();
  const user = useCurrentUser();
  const unread = unreadNotificationCount(state, user?.id);
  const inCart = showCart ? cartUnitCount(state, user?.id) : 0;
  return (
    <View style={styles.row}>
      <IconButton
        icon="bell"
        label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        count={unread}
        onPress={() => router.push('/notifications')}
      />
      {showCart ? (
        <IconButton
          icon="cart"
          label={inCart ? `Cart, ${inCart} items` : 'Cart'}
          count={inCart}
          onPress={() => router.navigate('/customer/cart')}
        />
      ) : null}
    </View>
  );
}

function IconButton({ icon, label, count, onPress }: { icon: 'bell' | 'cart'; label: string; count: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={styles.button}>
      <Icon name={icon} size={26} color={Colors.primary} />
      {count > 0 ? (
        <View style={styles.badge}>
          <CountBadge count={count} small />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  button: { padding: 2 },
  badge: { position: 'absolute', top: -4, right: -6 },
});
