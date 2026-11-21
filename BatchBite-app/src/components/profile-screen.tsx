import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useFeedback } from '@/components/ui/feedback';
import { Divider, ListRow, SwitchRow } from '@/components/ui/misc';
import { Screen, ScreenHeader } from '@/components/ui/screen';
import { AppText } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { unreadNotificationCount } from '@/data/selectors';
import { validateDisplayName } from '@/domain/validation';
import { ROLE_LABELS } from '@/domain/types';
import {
  deviceNotificationsGranted,
  deviceNotificationsSupported,
  enableDeviceNotifications,
} from '@/lib/device-notifications';
import { useApp, useDbState, useRequiredUser } from '@/state/app-provider';

import { HeaderActions } from './header-actions';

/** Profile tab shared by every role. Role-specific links are passed in as children. */
export function ProfileScreen({ children }: { children?: React.ReactNode }) {
  const user = useRequiredUser();
  const state = useDbState();
  const { services, signOut } = useApp();
  const { confirm, prompt, toast, showError } = useFeedback();
  const [deviceOn, setDeviceOn] = useState(false);
  const unread = unreadNotificationCount(state, user.id);

  useEffect(() => {
    void deviceNotificationsGranted().then(setDeviceOn);
  }, []);

  const orderCount = Object.values(state.orders).filter((o) => o.customerId === user.id).length;

  const editName = async () => {
    const name = await prompt({
      title: 'Your name',
      message: 'Shown to the bakery on your orders.',
      defaultValue: user.displayName,
      confirmLabel: 'Save',
      validate: validateDisplayName,
    });
    if (name === null) return;
    try {
      await services.auth.updateProfile(user.id, name);
      toast('Name updated');
    } catch (error) {
      showError(error);
    }
  };

  const logOut = async () => {
    const ok = await confirm({ title: 'Log out?', message: 'Your cart and orders stay saved on this device.', confirmLabel: 'Log out' });
    if (ok) {
      await signOut();
      router.replace('/sign-in');
    }
  };

  return (
    <Screen inTabs header={<ScreenHeader title="Profile" right={<HeaderActions showCart={user.role === 'customer'} />} />}>
      <Card style={styles.identity}>
        <View style={styles.avatar}>
          <AppText variant="title" color="inverse">
            {user.displayName.charAt(0).toUpperCase()}
          </AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="heading">{user.displayName}</AppText>
          <AppText variant="caption" color="textSecondary">
            @{user.username}
          </AppText>
          <View style={styles.badgeRow}>
            <Badge label={ROLE_LABELS[user.role]} tone="primary" />
            {user.role === 'customer' ? <Badge label={`${orderCount} order${orderCount === 1 ? '' : 's'}`} /> : null}
          </View>
        </View>
      </Card>

      {children}

      <View>
        <ListRow icon="bell" title="Notifications" subtitle="Order updates and alerts" badge={unread} onPress={() => router.push('/notifications')} />
        <Divider />
        <ListRow icon="edit" title="Edit name" subtitle={user.displayName} onPress={editName} />
        <Divider />
        <ListRow icon="lock" title="Change password" onPress={() => router.push('/account/password')} />
        <Divider />
        {deviceNotificationsSupported ? (
          <>
            <SwitchRow
              title="Device notifications"
              subtitle="Show alerts on this phone, even outside the app"
              value={deviceOn}
              onValueChange={async (value) => {
                if (!value) {
                  toast('Turn notifications off in your phone settings.', 'info');
                  return;
                }
                const granted = await enableDeviceNotifications();
                setDeviceOn(granted);
                if (!granted) toast('Notifications are blocked. Allow them in your phone settings.', 'error');
              }}
            />
            <Divider />
          </>
        ) : null}
        <ListRow icon="logout" title="Log out" danger onPress={logOut} />
      </View>

      <AppText variant="small" color="textMuted" align="center">
        {state.settings.businessName} · BatchBite 1.0 · data is stored on this device
        {Platform.OS === 'web' ? ' (browser storage)' : ''}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0, gap: Spacing.half },
  badgeRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
});
