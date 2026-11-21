import { Tabs } from 'expo-router';

import { tabIcon, tabScreenOptions } from '@/components/tab-bar';
import { cartUnitCount } from '@/data/selectors';
import { useCurrentUser, useDbState } from '@/state/app-provider';

/** Customer bottom navigation: Home, Orders, Cart, Profile (wireframe 5.3). */
export default function CustomerTabs() {
  const state = useDbState();
  const user = useCurrentUser();
  const inCart = cartUnitCount(state, user?.id);
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: tabIcon('orders') }} />
      <Tabs.Screen
        name="cart"
        options={{ title: 'Cart', tabBarIcon: tabIcon('cart'), tabBarBadge: inCart > 0 ? inCart : undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
    </Tabs>
  );
}
