import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HeaderActions } from '@/components/header-actions';
import { OrderCard } from '@/components/order-parts';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { ordersForViewer } from '@/data/selectors';
import { ACTIVE_STATUSES } from '@/domain/order-state';
import { useCurrentUser, useDbState, useNow } from '@/state/app-provider';
import { HOME_HREF } from '@/state/navigation';

/** Customer order history and live status (US-05). */
export default function OrdersScreen() {
  const state = useDbState();
  const user = useCurrentUser();
  const now = useNow();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const orders = ordersForViewer(state, user);
  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const past = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));
  const shown = tab === 'active' ? active : past;

  return (
    <Screen inTabs header={<ScreenHeader title="My orders" right={<HeaderActions showCart />} />}>
      <View style={styles.tabs}>
        <Chip label={`Active (${active.length})`} selected={tab === 'active'} onPress={() => setTab('active')} />
        <Chip label={`Past (${past.length})`} selected={tab === 'past'} onPress={() => setTab('past')} />
      </View>
      {shown.length === 0 ? (
        <EmptyState
          icon="orders"
          title={tab === 'active' ? 'No active orders' : 'No past orders yet'}
          message={tab === 'active' ? 'Orders you place appear here so you can follow them until pickup.' : undefined}
          actionLabel={tab === 'active' ? 'Browse batches' : undefined}
          onAction={() => router.navigate(HOME_HREF.customer)}
        />
      ) : (
        <View style={styles.list}>
          {shown.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              now={now}
              onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: Spacing.two },
  list: { gap: Spacing.three },
});
