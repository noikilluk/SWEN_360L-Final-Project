/**
 * Read-side helpers that turn stored tables into what screens need. Order
 * visibility rules live here (NFR-03: customers only ever see their own orders).
 */
import { canOrder, eligibleSlots, isVisibleToCustomers } from '@/domain/batch';
import { ACTIVE_STATUSES } from '@/domain/order-state';
import { can } from '@/domain/permissions';
import { dayKey, toDate } from '@/domain/time';
import type {
  Batch,
  CartItem,
  ChangeRequest,
  ID,
  Order,
  OrderStatus,
  PickupSlot,
  Product,
  ProductVariant,
  User,
} from '@/domain/types';

import type { DbState } from './schema';

export function ordersForViewer(state: DbState, viewer: User | null | undefined): Order[] {
  if (!viewer) return [];
  const all = Object.values(state.orders);
  const visible = can(viewer, 'viewAllOrders') ? all : viewer.role === 'customer' ? all.filter((o) => o.customerId === viewer.id) : [];
  return visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOrderForViewer(state: DbState, viewer: User | null | undefined, orderId: ID | undefined): Order | undefined {
  if (!viewer || !orderId) return undefined;
  const order = state.orders[orderId];
  if (!order) return undefined;
  if (can(viewer, 'viewAllOrders') || order.customerId === viewer.id) return order;
  return undefined;
}

export interface BatchWithProduct {
  batch: Batch;
  product: Product;
}

/** Batches shown on the customer home screen, soonest collection first. */
export function customerBatches(state: DbState, now: Date): BatchWithProduct[] {
  return Object.values(state.batches)
    .filter((b) => isVisibleToCustomers(b, now))
    .map((batch) => ({ batch, product: state.products[batch.productId] }))
    .filter((entry): entry is BatchWithProduct => !!entry.product && entry.product.active)
    .sort((a, b) => {
      // Orderable batches first, then by deadline.
      const openA = canOrder(a.batch, now) ? 0 : 1;
      const openB = canOrder(b.batch, now) ? 0 : 1;
      if (openA !== openB) return openA - openB;
      return a.batch.orderDeadline.localeCompare(b.batch.orderDeadline);
    });
}

export interface CartLine {
  item: CartItem;
  batch?: Batch;
  product?: Product;
  variant?: ProductVariant;
  unitPrice: number;
  lineTotal: number;
  /** Why the line cannot be checked out, if anything. */
  problem?: string;
}

export interface CartView {
  lines: CartLine[];
  note: string;
  slotId?: ID;
  subtotal: number;
  unitCount: number;
  collectionStarts: string[];
  slots: PickupSlot[];
  hasProblems: boolean;
}

export function cartView(state: DbState, customerId: ID, now: Date): CartView {
  const cart = state.carts[customerId];
  const lines: CartLine[] = (cart?.items ?? []).map((item) => {
    const batch = state.batches[item.batchId];
    const product = batch ? state.products[batch.productId] : undefined;
    const variant = product?.variants.find((v) => v.id === item.variantId);
    const unitPrice = product?.price ?? 0;
    let problem: string | undefined;
    if (!batch || !product) problem = 'No longer available';
    else if (!variant) problem = 'This option is no longer offered';
    else if (batch.remainingQuantity <= 0) problem = 'Sold out';
    else if (!canOrder(batch, now)) problem = 'Ordering has closed';
    else if (item.quantity > batch.remainingQuantity) problem = `Only ${batch.remainingQuantity} left`;
    return { item, batch, product, variant, unitPrice, lineTotal: unitPrice * item.quantity, problem };
  });
  const collectionStarts = [...new Set(lines.flatMap((l) => (l.batch ? [l.batch.collectionStart] : [])))];
  return {
    lines,
    note: cart?.note ?? '',
    slotId: cart?.slotId,
    subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    unitCount: lines.reduce((sum, l) => sum + l.item.quantity, 0),
    collectionStarts,
    slots: eligibleSlots(Object.values(state.slots), collectionStarts, now),
    hasProblems: lines.some((l) => l.problem),
  };
}

export function cartUnitCount(state: DbState, customerId: ID | undefined): number {
  if (!customerId) return 0;
  return (state.carts[customerId]?.items ?? []).reduce((sum, i) => sum + i.quantity, 0);
}

export function unreadNotificationCount(state: DbState, userId: ID | undefined): number {
  if (!userId) return 0;
  let count = 0;
  for (const n of Object.values(state.notifications)) if (n.userId === userId && !n.read) count += 1;
  return count;
}

export function notificationsFor(state: DbState, userId: ID | undefined) {
  if (!userId) return [];
  return Object.values(state.notifications)
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface BatchSummary {
  orders: Order[];
  activeOrders: Order[];
  statusCounts: Record<OrderStatus, number>;
  /** Units per option for orders still to make (confirmed or preparing). */
  toMake: { variantName: string; quantity: number }[];
  unitsByStatus: Record<OrderStatus, number>;
}

export function batchSummary(state: DbState, batchId: ID): BatchSummary {
  const orders = Object.values(state.orders)
    .filter((o) => o.items.some((i) => i.batchId === batchId))
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const statusCounts = emptyStatusRecord();
  const unitsByStatus = emptyStatusRecord();
  const toMake = new Map<string, number>();
  for (const order of orders) {
    statusCounts[order.status] += 1;
    for (const item of order.items) {
      if (item.batchId !== batchId) continue;
      unitsByStatus[order.status] += item.quantity;
      if (order.status === 'confirmed' || order.status === 'preparing') {
        toMake.set(item.variantName, (toMake.get(item.variantName) ?? 0) + item.quantity);
      }
    }
  }
  return {
    orders,
    activeOrders: orders.filter((o) => ACTIVE_STATUSES.includes(o.status)),
    statusCounts,
    toMake: [...toMake].map(([variantName, quantity]) => ({ variantName, quantity })).sort((a, b) => b.quantity - a.quantity),
    unitsByStatus,
  };
}

export function emptyStatusRecord(): Record<OrderStatus, number> {
  return { confirmed: 0, preparing: 0, ready: 0, collected: 0, missed: 0, cancelled: 0 };
}

export function pendingChangeRequests(state: DbState): ChangeRequest[] {
  return Object.values(state.changeRequests)
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function requestsForOrder(state: DbState, orderId: ID): ChangeRequest[] {
  return Object.values(state.changeRequests)
    .filter((r) => r.orderId === orderId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function paymentsForOrder(state: DbState, orderId: ID) {
  return Object.values(state.payments)
    .filter((p) => p.orderId === orderId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function staffMembers(state: DbState): User[] {
  return Object.values(state.users)
    .filter((u) => u.active && (u.role === 'kitchen' || u.role === 'owner'))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function slotsByDay(state: DbState, from: Date): { day: string; slots: PickupSlot[] }[] {
  const groups = new Map<string, PickupSlot[]>();
  const sorted = Object.values(state.slots)
    .filter((s) => toDate(s.end).getTime() >= from.getTime())
    .sort((a, b) => a.start.localeCompare(b.start));
  for (const slot of sorted) {
    const key = dayKey(slot.start);
    const list = groups.get(key) ?? [];
    list.push(slot);
    groups.set(key, list);
  }
  return [...groups].map(([day, slots]) => ({ day, slots }));
}
