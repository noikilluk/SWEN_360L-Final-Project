import {
  RethinkSans_400Regular,
  RethinkSans_500Medium,
  RethinkSans_600SemiBold,
  RethinkSans_700Bold,
  RethinkSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/rethink-sans';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { FeedbackProvider } from '@/components/ui/feedback';
import { Colors } from '@/constants/theme';
import { AppProvider, useCurrentUser } from '@/state/app-provider';
import { useNotificationBridge } from '@/state/use-notification-bridge';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.background,
    text: Colors.text,
    border: Colors.border,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    RethinkSans_400Regular,
    RethinkSans_500Medium,
    RethinkSans_600SemiBold,
    RethinkSans_700Bold,
    RethinkSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="dark" />
      <FeedbackProvider>
        <AppProvider>
          <RootNavigator />
        </AppProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );
}

/**
 * Role based navigation (FR-01). Each group of screens is only registered for
 * the roles allowed to use it, so typing a URL for another role's screen
 * redirects back to the start instead of opening it.
 */
function RootNavigator() {
  const user = useCurrentUser();
  const role = user?.role;
  const isStaff = role === 'owner' || role === 'kitchen';
  useNotificationBridge(user?.id ?? null);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" />

      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={!!user}>
        <Stack.Screen name="notifications" />
        <Stack.Screen name="account/password" />
        <Stack.Screen name="order/[id]" />

        <Stack.Protected guard={role === 'customer'}>
          <Stack.Screen name="customer" />
          <Stack.Screen name="batch/[id]" />
          <Stack.Screen name="order/change/[id]" />
        </Stack.Protected>

        <Stack.Protected guard={role === 'owner'}>
          <Stack.Screen name="owner" />
          <Stack.Screen name="manage/product/[id]" />
          <Stack.Screen name="manage/batch/form" />
          <Stack.Screen name="manage/ingredients" />
          <Stack.Screen name="manage/slots" />
          <Stack.Screen name="manage/requests" />
          <Stack.Screen name="manage/tasks" />
        </Stack.Protected>

        <Stack.Protected guard={isStaff}>
          <Stack.Screen name="manage/board" />
          <Stack.Screen name="manage/scan" />
          <Stack.Screen name="manage/batch/[id]" />
        </Stack.Protected>

        <Stack.Protected guard={role === 'kitchen'}>
          <Stack.Screen name="kitchen" />
        </Stack.Protected>

        <Stack.Protected guard={role === 'admin'}>
          <Stack.Screen name="admin" />
          <Stack.Screen name="manage/user/[id]" />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}
