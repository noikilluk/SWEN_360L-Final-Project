import type { BottomTabNavigationOptions } from 'expo-router/tabs';
import type { ColorValue } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

import { Icon, type IconName } from './ui/icon';

/** Shared look for every role's bottom tab bar (matches the Home wireframe). */
export const tabScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarActiveTintColor: Colors.primary,
  tabBarInactiveTintColor: Colors.textMuted,
  tabBarStyle: { backgroundColor: Colors.background, borderTopColor: Colors.border },
  tabBarLabelStyle: { fontFamily: Fonts.medium, fontSize: 11 },
  tabBarBadgeStyle: { backgroundColor: Colors.primary, color: Colors.inverse, fontFamily: Fonts.semibold, fontSize: 10 },
  sceneStyle: { backgroundColor: Colors.background },
};

export function tabIcon(name: IconName) {
  const TabIcon = ({ color }: { color: ColorValue }) => <Icon name={name} size={24} color={color} />;
  return TabIcon;
}
