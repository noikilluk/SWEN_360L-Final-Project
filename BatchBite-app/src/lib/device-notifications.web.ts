/**
 * Web build: expo-notifications does not support the browser, so the app
 * relies on the in-app notification inbox and toasts instead.
 */
export const deviceNotificationsSupported = false;

export async function enableDeviceNotifications(): Promise<boolean> {
  return false;
}

export async function deviceNotificationsGranted(): Promise<boolean> {
  return false;
}

export async function presentDeviceNotification(_title: string, _body: string): Promise<void> {
  // Not available on the web.
}
