/**
 * In-app notifications (confirmation, ready, delay, missed collection, and
 * staff alerts). Notifications are written inside the same transaction as the
 * change that caused them, so they can never get out of sync with orders.
 * The app layer also shows a device notification for the signed-in user.
 */
import type { Transaction } from '@/data/database';
import type { AppNotification, ID, NotificationKind, UserRole } from '@/domain/types';

import { type ServiceContext, loadActor } from './context';

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  orderId?: ID;
  batchId?: ID;
}

/** Keeps each user's inbox to a sensible size. */
const MAX_PER_USER = 100;

export function notifyUser(tx: Transaction, ctx: ServiceContext, userId: ID, input: NotifyInput): AppNotification {
  const notification: AppNotification = {
    id: ctx.crypto.randomId(),
    userId,
    read: false,
    createdAt: ctx.now().toISOString(),
    ...input,
  };
  tx.put('notifications', notification);
  pruneInbox(tx, userId);
  return notification;
}

/** Sends the same notification to every active user with one of `roles`. */
export function notifyRoles(tx: Transaction, ctx: ServiceContext, roles: readonly UserRole[], input: NotifyInput): void {
  for (const user of tx.all('users')) {
    if (user.active && roles.includes(user.role)) notifyUser(tx, ctx, user.id, input);
  }
}

function pruneInbox(tx: Transaction, userId: ID) {
  const mine = tx.all('notifications').filter((n) => n.userId === userId);
  if (mine.length <= MAX_PER_USER) return;
  mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const old of mine.slice(0, mine.length - MAX_PER_USER)) tx.delete('notifications', old.id);
}

export class NotificationService {
  constructor(private readonly ctx: ServiceContext) {}

  markRead(actorId: ID, notificationId: ID) {
    return this.ctx.db.transaction((tx) => {
      loadActor(tx, actorId);
      const notification = tx.get('notifications', notificationId);
      if (!notification || notification.userId !== actorId || notification.read) return;
      tx.put('notifications', { ...notification, read: true });
    });
  }

  markAllRead(actorId: ID) {
    return this.ctx.db.transaction((tx) => {
      loadActor(tx, actorId);
      for (const notification of tx.all('notifications')) {
        if (notification.userId === actorId && !notification.read) {
          tx.put('notifications', { ...notification, read: true });
        }
      }
    });
  }

  clearRead(actorId: ID) {
    return this.ctx.db.transaction((tx) => {
      loadActor(tx, actorId);
      for (const notification of tx.all('notifications')) {
        if (notification.userId === actorId && notification.read) tx.delete('notifications', notification.id);
      }
    });
  }
}
