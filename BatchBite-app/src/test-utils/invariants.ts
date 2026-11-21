import type { DbState } from '@/data/schema';

/**
 * Cross-table consistency rules. If any of these break, stock, slots or
 * payments have drifted from the order book. Returns a list of problems.
 */
export function findInvariantViolations(state: DbState): string[] {
  const problems: string[] = [];
  const orders = Object.values(state.orders);
  const live = orders.filter((o) => o.status !== 'cancelled');

  for (const batch of Object.values(state.batches)) {
    const ordered = live.flatMap((o) => o.items).filter((i) => i.batchId === batch.id).reduce((s, i) => s + i.quantity, 0);
    if (batch.remainingQuantity !== batch.maxQuantity - ordered) {
      problems.push(`Batch ${batch.id}: remaining ${batch.remainingQuantity}, expected ${batch.maxQuantity - ordered}`);
    }
    if (batch.remainingQuantity < 0) problems.push(`Batch ${batch.id} oversold`);
  }

  for (const slot of Object.values(state.slots)) {
    const booked = live.filter((o) => o.slotId === slot.id).length;
    if (slot.reservedOrders !== booked) problems.push(`Slot ${slot.id}: reserved ${slot.reservedOrders}, expected ${booked}`);
    if (slot.reservedOrders > slot.maxOrders) problems.push(`Slot ${slot.id} over capacity`);
  }

  for (const ingredient of Object.values(state.ingredients)) {
    const held = live
      .filter((o) => !o.ingredientsConsumed)
      .flatMap((o) => o.ingredientReservations)
      .filter((r) => r.ingredientId === ingredient.id)
      .reduce((s, r) => s + r.quantity, 0);
    if (Math.abs(ingredient.reserved - held) > 0.01) {
      problems.push(`Ingredient ${ingredient.name}: reserved ${ingredient.reserved}, expected ${held}`);
    }
    if (ingredient.stock < 0) problems.push(`Ingredient ${ingredient.name} has negative stock`);
  }

  for (const order of orders) {
    const payments = Object.values(state.payments).filter((p) => p.orderId === order.id);
    const refunds = payments.filter((p) => p.kind === 'refund').reduce((s, p) => s + p.amount, 0);
    const charges = payments.filter((p) => p.kind === 'charge').reduce((s, p) => s + p.amount, 0);
    if (order.refundedAmount !== refunds) problems.push(`Order ${order.number}: refundedAmount does not match refunds`);
    if (charges - refunds < 0) problems.push(`Order ${order.number}: refunded more than was paid`);
    const subtotal = order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    if (subtotal !== order.subtotal) problems.push(`Order ${order.number}: subtotal mismatch`);
  }
  return problems;
}
