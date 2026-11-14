/**
 * Sales and production insights for the business owner. Pure functions over
 * the stored data, so they are easy to test and always match the order book.
 */
import type { DbState } from '@/data/schema';

import { soldQuantity } from './batch';
import { linesCost } from './recipe';
import { addDays, dayKey, formatDay, startOfDay, toDate } from './time';
import type { Fils, ID, IngredientUnit, Order } from './types';

export interface DailyPoint {
  key: string;
  label: string;
  revenue: Fils;
  orders: number;
}

export interface ProductPerformance {
  productId: ID;
  name: string;
  units: number;
  revenue: Fils;
}

export interface BatchPerformance {
  batchId: ID;
  name: string;
  collectionStart: string;
  sold: number;
  max: number;
  sellThrough: number;
}

export interface IngredientUsage {
  ingredientId: ID;
  name: string;
  unit: IngredientUnit;
  quantity: number;
  cost: Fils;
}

export interface Insights {
  days: number;
  netRevenue: Fils;
  grossSales: Fils;
  refunds: Fils;
  orderCount: number;
  unitsSold: number;
  averageOrderValue: Fils;
  cancelledCount: number;
  missedCount: number;
  collectedCount: number;
  /** Collected / (collected + missed). Null when nothing was due yet. */
  collectionRate: number | null;
  daily: DailyPoint[];
  topProducts: ProductPerformance[];
  batches: BatchPerformance[];
  /** Booked orders / capacity over the slots in the period. */
  slotUtilisation: number | null;
  ingredientCost: Fils;
  estimatedMargin: Fils;
  ingredientUsage: IngredientUsage[];
  /** Average minutes from confirmation to ready. */
  averagePrepMinutes: number | null;
  /** Share of ready orders that were ready by their slot start (plus reported delay). */
  onTimeRate: number | null;
}

export function computeInsights(state: DbState, now: Date, days: number): Insights {
  const from = startOfDay(addDays(now, -(days - 1)));
  const inRange = (iso: string) => toDate(iso).getTime() >= from.getTime() && toDate(iso).getTime() <= now.getTime();

  const daily = new Map<string, DailyPoint>();
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    daily.set(dayKey(day), { key: dayKey(day), label: formatDay(day), revenue: 0, orders: 0 });
  }

  let grossSales = 0;
  let refunds = 0;
  for (const payment of Object.values(state.payments)) {
    if (!inRange(payment.createdAt)) continue;
    const point = daily.get(dayKey(payment.createdAt));
    if (payment.kind === 'charge') {
      grossSales += payment.amount;
      if (point) point.revenue += payment.amount;
    } else {
      refunds += payment.amount;
      if (point) point.revenue -= payment.amount;
    }
  }

  const orders = Object.values(state.orders).filter((o) => inRange(o.createdAt));
  const kept = orders.filter((o) => o.status !== 'cancelled');
  for (const order of kept) {
    const point = daily.get(dayKey(order.createdAt));
    if (point) point.orders += 1;
  }

  const products = new Map<ID, ProductPerformance>();
  let unitsSold = 0;
  for (const order of kept) {
    for (const item of order.items) {
      unitsSold += item.quantity;
      const entry = products.get(item.productId) ?? {
        productId: item.productId,
        name: state.products[item.productId]?.name ?? item.productName,
        units: 0,
        revenue: 0,
      };
      entry.units += item.quantity;
      entry.revenue += item.quantity * item.unitPrice;
      products.set(item.productId, entry);
    }
  }

  const usage = new Map<ID, number>();
  for (const order of kept) {
    for (const hold of order.ingredientReservations) {
      usage.set(hold.ingredientId, (usage.get(hold.ingredientId) ?? 0) + hold.quantity);
    }
  }
  const ingredientUsage: IngredientUsage[] = [];
  for (const [ingredientId, quantity] of usage) {
    const ingredient = state.ingredients[ingredientId];
    if (!ingredient) continue;
    ingredientUsage.push({
      ingredientId,
      name: ingredient.name,
      unit: ingredient.unit,
      quantity: Math.round(quantity),
      cost: linesCost([{ ingredientId, quantity }], state.ingredients),
    });
  }
  ingredientUsage.sort((a, b) => b.cost - a.cost);
  const ingredientCost = ingredientUsage.reduce((sum, u) => sum + u.cost, 0);

  const batches: BatchPerformance[] = Object.values(state.batches)
    .filter((b) => b.status !== 'draft' && inRangeOrUpcoming(b.collectionStart, from))
    .map((b) => ({
      batchId: b.id,
      name: state.products[b.productId]?.name ?? 'Product',
      collectionStart: b.collectionStart,
      sold: soldQuantity(b),
      max: b.maxQuantity,
      sellThrough: b.maxQuantity ? soldQuantity(b) / b.maxQuantity : 0,
    }))
    .sort((a, b) => a.collectionStart.localeCompare(b.collectionStart));

  const slots = Object.values(state.slots).filter((s) => inRange(s.start));
  const capacity = slots.reduce((sum, s) => sum + s.maxOrders, 0);
  const booked = slots.reduce((sum, s) => sum + s.reservedOrders, 0);

  const collectedCount = orders.filter((o) => o.status === 'collected').length;
  const missedCount = orders.filter((o) => o.status === 'missed').length;
  const netRevenue = grossSales - refunds;

  return {
    days,
    netRevenue,
    grossSales,
    refunds,
    orderCount: kept.length,
    unitsSold,
    averageOrderValue: kept.length ? Math.round(kept.reduce((s, o) => s + o.total, 0) / kept.length) : 0,
    cancelledCount: orders.length - kept.length,
    missedCount,
    collectedCount,
    collectionRate: collectedCount + missedCount ? collectedCount / (collectedCount + missedCount) : null,
    daily: [...daily.values()],
    topProducts: [...products.values()].sort((a, b) => b.units - a.units),
    batches,
    slotUtilisation: capacity ? booked / capacity : null,
    ingredientCost,
    estimatedMargin: netRevenue - ingredientCost,
    ingredientUsage,
    averagePrepMinutes: averagePrep(kept),
    onTimeRate: onTimeRate(kept),
  };
}

function inRangeOrUpcoming(iso: string, from: Date) {
  return toDate(iso).getTime() >= from.getTime();
}

function statusTime(order: Order, status: Order['status']): number | null {
  const entry = order.history.find((h) => h.status === status);
  return entry ? toDate(entry.at).getTime() : null;
}

function averagePrep(orders: Order[]): number | null {
  const durations: number[] = [];
  for (const order of orders) {
    const confirmed = statusTime(order, 'confirmed');
    const ready = statusTime(order, 'ready');
    if (confirmed !== null && ready !== null && ready >= confirmed) durations.push((ready - confirmed) / 60_000);
  }
  if (!durations.length) return null;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}

function onTimeRate(orders: Order[]): number | null {
  let ready = 0;
  let onTime = 0;
  for (const order of orders) {
    const readyAt = statusTime(order, 'ready');
    if (readyAt === null) continue;
    ready += 1;
    const due = toDate(order.slotStart).getTime() + (order.delay?.minutes ?? 0) * 60_000;
    if (readyAt <= due) onTime += 1;
  }
  return ready ? onTime / ready : null;
}

