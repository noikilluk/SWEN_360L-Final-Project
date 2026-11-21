import { Tabs } from 'expo-router';

import { tabIcon, tabScreenOptions } from '@/components/tab-bar';
import { useDbState } from '@/state/app-provider';

/** Administrator navigation: accounts, settings, profile. */
export default function AdminTabs() {
  const state = useDbState();
  const resets = Object.values(state.resetRequests).filter((r) => r.status === 'pending').length;
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Users', tabBarIcon: tabIcon('users'), tabBarBadge: resets || undefined }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }} />
    </Tabs>
  );
}
