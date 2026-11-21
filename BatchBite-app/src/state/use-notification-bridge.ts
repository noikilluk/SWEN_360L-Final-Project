import { useEffect, useRef } from 'react';

import { useFeedback } from '@/components/ui/feedback';
import { deviceNotificationsSupported, presentDeviceNotification } from '@/lib/device-notifications';
import type { ID } from '@/domain/types';

import { useDbState } from './app-provider';

/**
 * Surfaces new notifications for the signed-in user as they arrive: a device
 * notification on Android/iOS, or a toast on the web.
 */
export function useNotificationBridge(userId: ID | null) {
  const { notifications } = useDbState();
  const { toast } = useFeedback();
  const seen = useRef<{ userId: ID | null; ids: Set<ID> } | null>(null);

  useEffect(() => {
    const mine = Object.values(notifications).filter((n) => n.userId === userId);
    if (!seen.current || seen.current.userId !== userId) {
      // First render for this user: everything already stored counts as seen.
      seen.current = { userId, ids: new Set(mine.map((n) => n.id)) };
      return;
    }
    for (const notification of mine) {
      if (seen.current.ids.has(notification.id)) continue;
      seen.current.ids.add(notification.id);
      if (notification.read) continue;
      if (deviceNotificationsSupported) {
        void presentDeviceNotification(notification.title, notification.body);
      } else {
        toast(notification.title, 'info');
      }
    }
  }, [notifications, userId, toast]);
}
