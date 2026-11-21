/**
 * Shared building blocks for checkout, cancellation and order changes. They all
 * run inside a transaction, so a failure part-way through changes nothing.
 */
import type { Transaction } from '@/data/database';
import { AppError } from '@/domain/errors';
import { formatMoney } from '@/domain/money';
import { STATUS_LABELS } from '@/domain/order-state';
import { findShortfalls, formatQuantity, mergeLines, scaleLines, unitRecipe } from '@/domain/recipe';
import type {
  Fils,
  ID,
  IngredientReservation,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentStatus,
} from '@/domain/types';

import { checkLowStock } from './catalogue-service';
import { CODE_ALPHABET, type ServiceContext } from './context';

/** Ingredients for a set of order lines, using each line's locked product version. */
export function ingredientNeeds(
  tx: Transaction,
  items: readonly Pick<OrderItem, 'productVersionId' | 'variantId' | 'quantity'>[],
): IngredientReservation[] {
  const lines = items.flatMap((item) => {
    const version = tx.get('productVersions', item.productVersionId);
    if (!version) return [];
    return scaleLines(unitRecipe(version, item.variantId), item.quantity);
  });
  return mergeLines(lines);
}

/** Holds ingredient stock for an order. Throws if `enforce` is on and stock is short. */
export function reserveIngredients(
  tx: Transaction,
  ctx: ServiceContext,
  needs: readonly IngredientReservation[],
  enforce: boolean,
): IngredientReservation[] {
  if (enforce) {
    const shortfalls = findShortfalls(needs, tx.read('ingredients'));
    if (shortfalls.length) {
      const detail = shortfalls.map((s) => `${s.name} (short ${formatQuantity(s.missing, s.unit)})`).join(', ');
      throw new AppError(
        'INSUFFICIENT_INGREDIENTS',
        `Sorry, the kitchen does not have enough ingredients for this order: ${detail}. Try a smaller quantity.`,
      );
    }
  }
  const held: IngredientReservation[] = [];
  for (const need of needs) {
    const ingredient = tx.get('ingredients', need.ingredientId);
    if (!ingredient) continue;
    const updated = { ...ingredient, reserved: round(ingredient.reserved + need.quantity), updatedAt: ctx.now().toISOString() };
    tx.put('ingredients', updated);
    checkLowStock(tx, ctx, ingredient, updated);
    held.push(need);
  }
  return held;
}

export function releaseIngredients(tx: Transaction, ctx: ServiceContext, reservations: readonly IngredientReservation[]) {
  for (const hold of reservations) {
    const ingredient = tx.get('ingredients', hold.ingredientId);
    if (!ingredient) continue;
    tx.put('ingredients', {
      ...ingredient,
      reserved: Math.max(0, round(ingredient.reserved - hold.quantity)),
      updatedAt: ctx.now().toISOString(),
    });
  }
}

/** Production started: the held stock is used up. */
export function consumeIngredients(tx: Transaction, ctx: ServiceContext, reservations: readonly IngredientReservation[]) {
  for (const hold of reservations) {
    const ingredient = tx.get('ingredients', hold.ingredientId);
    if (!ingredient) continue;
    tx.put('ingredients', {
      ...ingredient,
      stock: Math.max(0, round(ingredient.stock - hold.quantity)),
      reserved: Math.max(0, round(ingredient.reserved - hold.quantity)),
      updatedAt: ctx.now().toISOString(),
    });
  }
}

/** Gives back batch units, the pickup slot place and held ingredients. */
export function releaseOrderHolds(tx: Transaction, ctx: ServiceContext, order: Order) {
  for (const item of order.items) {
    const batch = tx.get('batches', item.batchId);
    if (batch) {
      tx.put('batches', {
        ...batch,
        remainingQuantity: Math.min(batch.maxQuantity, batch.remainingQuantity + item.quantity),
      });
    }
  }
  const slot = tx.get('slots', order.slotId);
  if (slot) tx.put('slots', { ...slot, reservedOrders: Math.max(0, slot.reservedOrders - 1) });
  if (!order.ingredientsConsumed) releaseIngredients(tx, ctx, order.ingredientReservations);
}

export function recordPayment(
  tx: Transaction,
  ctx: ServiceContext,
  input: Pick<Payment, 'orderId' | 'kind' | 'amount' | 'reason' | 'createdBy'>,
): Payment {
  const settings = tx.read('settings');
  return tx.put('payments', {
    id: ctx.crypto.randomId(),
    method: 'simulated_card',
    cardLast4: settings.simulatedCardLast4,
    reference: `SIM-${ctx.crypto.randomCode(8)}`,
    createdAt: ctx.now().toISOString(),
    ...input,
  });
}

/** `charged` is everything the customer paid for the order, including later top-ups. */
export function paymentStatusFor(charged: Fils, refunded: Fils): PaymentStatus {
  if (refunded <= 0) return 'paid';
  return refunded >= charged ? 'refunded' : 'partially_refunded';
}

export function paymentSummary(tx: Transaction, orderId: ID): { charged: Fils; refunded: Fils } {
  let charged = 0;
  let refunded = 0;
  for (const payment of tx.all('payments')) {
    if (payment.orderId !== orderId) continue;
    if (payment.kind === 'charge') charged += payment.amount;
    else refunded += payment.amount;
  }
  return { charged, refunded };
}

/** Total of the customer's charges minus refunds for an order. */
export function netPaid(tx: Transaction, orderId: ID): Fils {
  const { charged, refunded } = paymentSummary(tx, orderId);
  return charged - refunded;
}

export function nextOrderNumber(tx: Transaction): string {
  const meta = tx.read('meta');
  const sequence = meta.orderSequence + 1;
  tx.setDocument('meta', { ...meta, orderSequence: sequence });
  return `BB-${sequence}`;
}

export function uniqueCollectionCode(tx: Transaction, ctx: ServiceContext): string {
  const used = new Set(tx.all('orders').map((o) => o.collectionCode));
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = ctx.crypto.randomCode(6);
    if (!used.has(code)) return code;
  }
  throw new AppError('CONFLICT', 'Could not create a collection code. Please try again.');
}

/**
 * Accepts the QR payload (`BATCHBITE:<orderId>:<code>`) or a typed code such
 * as `k7q-2px` and returns the normalised 6 character code.
 */
export function parseCollectionCode(raw: string): { orderId?: ID; code: string } | null {
  const text = raw.trim();
  const qr = /^BATCHBITE:([^:]+):([A-Za-z0-9]+)$/.exec(text);
  if (qr) return { orderId: qr[1], code: qr[2].toUpperCase() };
  const code = text.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== 6 || [...code].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return { code };
}

export function collectionQrPayload(order: Pick<Order, 'id' | 'collectionCode'>): string {
  return `BATCHBITE:${order.id}:${order.collectionCode}`;
}

export function withStatus(order: Order, status: OrderStatus, by: ID | 'system', at: string, note?: string): Order {
  return {
    ...order,
    status,
    updatedAt: at,
    history: [...order.history, { status, at, by, ...(note ? { note } : {}) }],
  };
}

export function itemsSummary(items: readonly Pick<OrderItem, 'quantity' | 'productName'>[]): string {
  return items.map((i) => `${i.quantity} × ${i.productName}`).join(', ');
}

export function refundText(amount: Fils): string {
  return amount > 0 ? ` ${formatMoney(amount)} has been refunded to your card.` : '';
}

export function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
