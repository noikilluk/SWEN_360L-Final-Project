/**
 * Order life cycle (FR-08 and design section 7).
 *
 *   (start) -> Confirmed -> Preparing -> Ready -> Collected
 *                  |                       |
 *                  v                       v
 *              Cancelled                 Missed -> Collected (late pickup)
 *
 * Sprint 2 adds the `missed` state for the "missed collection" notification:
 * a ready order whose pickup slot has ended (plus a grace period) is marked as
 * missed automatically. The customer can still collect it later.
 *
 * Every status change in the app goes through `assertTransition`, so an order
 * can never be collected before it is ready, and final states never change.
 */
import { AppError } from './errors';
import type { OrderStatus, UserRole } from './types';

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['collected', 'missed'],
  missed: ['collected'],
  collected: [],
  cancelled: [],
};

/** Who may trigger each target status. `system` is the background scheduler. */
const TRANSITION_ACTORS: Record<OrderStatus, readonly (UserRole | 'system')[]> = {
  confirmed: [],
  preparing: ['owner', 'kitchen'],
  ready: ['owner', 'kitchen'],
  collected: ['owner', 'kitchen'],
  missed: ['owner', 'system'],
  cancelled: ['owner'],
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  collected: 'Collected',
  missed: 'Missed pickup',
  cancelled: 'Cancelled',
};

/** Statuses that still need work from the kitchen or a pickup from the customer. */
export const ACTIVE_STATUSES: readonly OrderStatus[] = ['confirmed', 'preparing', 'ready', 'missed'];

export const FINAL_STATUSES: readonly OrderStatus[] = ['collected', 'cancelled'];

export function isFinalStatus(status: OrderStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canActorTransition(role: UserRole | 'system', to: OrderStatus): boolean {
  return TRANSITION_ACTORS[to].includes(role);
}

/**
 * Throws when the change is not allowed by the state diagram or the actor is
 * not authorised to make it.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus, actor: UserRole | 'system'): void {
  if (!canTransition(from, to)) {
    throw new AppError(
      'INVALID_TRANSITION',
      `An order that is ${STATUS_LABELS[from].toLowerCase()} cannot be changed to ${STATUS_LABELS[to].toLowerCase()}.`,
    );
  }
  if (!canActorTransition(actor, to)) {
    throw new AppError('FORBIDDEN', `You are not allowed to mark orders as ${STATUS_LABELS[to].toLowerCase()}.`);
  }
}

/** The next forward step the kitchen can take, used for one-tap buttons. */
export function nextKitchenStatus(status: OrderStatus): 'preparing' | 'ready' | null {
  if (status === 'confirmed') return 'preparing';
  if (status === 'preparing') return 'ready';
  return null;
}
