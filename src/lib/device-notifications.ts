/**
 * Device (OS) notifications on Android and iOS, shown for the signed-in user
 * on top of the in-app inbox. Uses local notifications only, which work in
 * Expo Go and development builds without a push server.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export const deviceNotificationsSupported = true;

/** Asks for permission. Returns true when notifications may be shown. */
export async function enableDeviceNotifications(): Promise<boolean> {
  try {
    configure();
    if (Platform.OS === 'android') {
      // Android 13+ only shows the permission prompt once a channel exists.
      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Order updates',
        importance: AndroidImportance.HIGH,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export async function deviceNotificationsGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function presentDeviceNotification(title: string, body: string): Promise<void> {
  try {
    configure();
    if (!(await deviceNotificationsGranted())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: Platform.OS === 'android' ? { channelId: 'orders' } : null,
    });
  } catch {
    // Device notifications are a convenience; the in-app inbox always has the message.
  }
}
