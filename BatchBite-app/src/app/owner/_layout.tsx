import { Tabs } from 'expo-router';

import { tabIcon, tabScreenOptions } from '@/components/tab-bar';
import { pendingChangeRequests } from '@/data/selectors';
import { useDbState } from '@/state/app-provider';

/** Business owner navigation (US-06, US-07, FR-09). */
export default function OwnerTabs() {
  const state = useDbState();
  const pending = pendingChangeRequests(state).length;
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: tabIcon('dashboard'), tabBarBadge: pending || undefined }} />
      <Tabs.Screen name="batches" options={{ title: 'Batches', tabBarIcon: tabIcon('calendar') }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: tabIcon('product') }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: tabIcon('insights') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('more') }} />
    </Tabs>
  );
}
