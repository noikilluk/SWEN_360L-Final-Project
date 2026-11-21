import { Tabs } from 'expo-router';

import { tabIcon, tabScreenOptions } from '@/components/tab-bar';
import { useCurrentUser, useDbState } from '@/state/app-provider';

/** Kitchen staff navigation: production board, tasks, QR scan, profile (US-08). */
export default function KitchenTabs() {
  const state = useDbState();
  const user = useCurrentUser();
  const openTasks = Object.values(state.tasks).filter(
    (t) => t.status !== 'done' && (t.assigneeId === user?.id || !t.assigneeId),
  ).length;
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Board', tabBarIcon: tabIcon('kitchen') }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: tabIcon('tasks'), tabBarBadge: openTasks || undefined }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: tabIcon('scan') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
    </Tabs>
  );
}
