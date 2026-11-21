import { addMinutes } from '@/domain/time';
import { collectionQrPayload } from '@/services/order-helpers';
import { findInvariantViolations } from '@/test-utils/invariants';
import { createScenario } from '@/test-utils/scenario';

describe('order life cycle (FR-08, US-05, US-08)', () => {
  it('moves Confirmed → Preparing → Ready → Collected, using ingredients when production starts', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 2);
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'preparing');
    let state = s.db.getState();
    expect(state.ingredients[s.flour.id]).toMatchObject({ stock: 9800, reserved: 0 });

    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'ready');
    const found = s.services.orders.findByCollectionCode(s.kitchen.id, collectionQrPayload(order));
    expect(found.id).toBe(order.id);
    const collected = await s.services.orders.confirmCollection(s.kitchen.id, order.id, order.collectionCode.toLowerCase());
    expect(collected.status).toBe('collected');
    state = s.db.getState();
    expect(state.orders[order.id].history.map((h) => h.status)).toEqual(['confirmed', 'preparing', 'ready', 'collected']);
    const customerKinds = Object.values(state.notifications).filter((n) => n.userId === s.alice.id).map((n) => n.kind);
    expect(customerKinds).toEqual(expect.arrayContaining(['order_confirmed', 'order_preparing', 'order_ready', 'order_collected']));
    expect(findInvariantViolations(state)).toEqual([]);
  });

  it('blocks invalid transitions and wrong collection codes', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 1);
    await expect(s.services.orders.confirmCollection(s.kitchen.id, order.id, order.collectionCode)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(s.services.orders.updateStatus(s.kitchen.id, order.id, 'ready')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'preparing');
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'ready');
    await expect(s.services.orders.confirmCollection(s.kitchen.id, order.id, 'AAAAAA')).rejects.toMatchObject({ code: 'INVALID_CODE' });
    expect(() => s.services.orders.findByCollectionCode(s.kitchen.id, 'not a code')).toThrow(/not a BatchBite collection code/);
  });

  it('only staff change statuses and only the owner cancels', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 1);
    await expect(s.services.orders.updateStatus(s.alice.id, order.id, 'preparing')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.services.orders.cancel(s.kitchen.id, order.id, 'No')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('owner cancellation releases stock, slot and ingredients and refunds in full', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 3);
    const cancelled = await s.services.orders.cancel(s.owner.id, order.id, 'Oven broke');
    const state = s.db.getState();
    expect(cancelled).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', refundedAmount: 15_000 });
    expect(state.batches[s.batch.id].remainingQuantity).toBe(10);
    expect(state.slots[s.slots[0].id].reservedOrders).toBe(0);
    expect(state.ingredients[s.flour.id].reserved).toBe(0);
    expect(findInvariantViolations(state)).toEqual([]);
  });

  it('cannot cancel once preparation has started', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 1);
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'preparing');
    await expect(s.services.orders.cancel(s.owner.id, order.id, 'Too late')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('issues partial refunds and never refunds more than was paid', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 2);
    const refunded = await s.services.orders.refund(s.owner.id, order.id, 2500, 'One was squashed');
    expect(refunded).toMatchObject({ refundedAmount: 2500, paymentStatus: 'partially_refunded' });
    await expect(s.services.orders.refund(s.owner.id, order.id, 9000, 'Too much')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('marks ready orders as missed after the slot plus grace period, and still allows late pickup', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 1);
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'preparing');
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'ready');
    s.clock.set(addMinutes(order.slotEnd, 29));
    expect(await s.services.orders.runScheduledChecks()).toBe(0);
    s.clock.set(addMinutes(order.slotEnd, 31));
    expect(await s.services.orders.runScheduledChecks()).toBe(1);
    expect(s.db.getState().orders[order.id].status).toBe('missed');
    expect(Object.values(s.db.getState().notifications).some((n) => n.userId === s.alice.id && n.kind === 'order_missed')).toBe(true);
    await s.services.orders.confirmCollection(s.owner.id, order.id, order.collectionCode);
    expect(s.db.getState().orders[order.id].status).toBe('collected');
  });

  it('reported delays notify the customer and push back the missed-pickup check', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 1);
    await s.services.orders.reportDelay(s.kitchen.id, [order.id], 60, 'Oven repair');
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'preparing');
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'ready');
    s.clock.set(addMinutes(order.slotEnd, 45));
    expect(await s.services.orders.runScheduledChecks()).toBe(0);
    const delayed = Object.values(s.db.getState().notifications).find((n) => n.kind === 'order_delayed');
    expect(delayed?.body).toContain('60 min');
  });
});

describe('change requests and refunds (Sprint 2)', () => {
  it('approving a smaller order releases stock and refunds the difference at the locked price', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 3);
    const request = await s.services.orders.requestChange(s.alice.id, order.id, {
      type: 'modify',
      reason: 'Fewer guests',
      items: [{ orderItemId: order.items[0].id, variantId: order.items[0].variantId, quantity: 1 }],
      slotId: s.slots[1].id,
    });
    const { priceDifference } = await s.services.orders.resolveRequest(s.owner.id, request.id, true, 'Done');
    const state = s.db.getState();
    expect(priceDifference).toBe(-10_000);
    expect(state.orders[order.id]).toMatchObject({ total: 5000, refundedAmount: 10_000, slotId: s.slots[1].id });
    expect(state.batches[s.batch.id].remainingQuantity).toBe(9);
    expect(state.ingredients[s.flour.id].reserved).toBe(100);
    expect(findInvariantViolations(state)).toEqual([]);
  });

  it('approving a larger order charges the difference', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 1);
    const request = await s.services.orders.requestChange(s.alice.id, order.id, {
      type: 'modify',
      reason: '',
      items: [{ orderItemId: order.items[0].id, variantId: s.product.variants[1].id, quantity: 2 }],
    });
    const { priceDifference } = await s.services.orders.resolveRequest(s.owner.id, request.id, true, '');
    expect(priceDifference).toBe(5000);
    const order2 = s.db.getState().orders[order.id];
    expect(order2.items[0]).toMatchObject({ quantity: 2, variantName: 'Extra sweet' });
    expect(order2.paymentStatus).toBe('paid');
    expect(findInvariantViolations(s.db.getState())).toEqual([]);
  });

  it('approved cancellation requests cancel and refund; production auto-declines pending requests', async () => {
    const s = await createScenario();
    const first = await s.order(s.alice, 1);
    const cancelRequest = await s.services.orders.requestChange(s.alice.id, first.id, { type: 'cancel', reason: 'Plans changed' });
    await s.services.orders.resolveRequest(s.owner.id, cancelRequest.id, true, '');
    expect(s.db.getState().orders[first.id]).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });

    const second = await s.order(s.bob, 1);
    const modify = await s.services.orders.requestChange(s.bob.id, second.id, { type: 'cancel', reason: 'Oops' });
    await s.services.orders.updateStatus(s.kitchen.id, second.id, 'preparing');
    expect(s.db.getState().changeRequests[modify.id].status).toBe('rejected');
  });

  it('customers can only change their own confirmed orders', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 1);
    await expect(s.services.orders.requestChange(s.bob.id, order.id, { type: 'cancel', reason: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.services.orders.requestChange(s.alice.id, order.id, { type: 'modify', reason: '' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('recipe and price versioning (Sprint 2)', () => {
  it('keeps confirmed orders on the version they were bought with', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 2);
    const product = s.db.getState().products[s.product.id];
    const { product: updated, newVersion } = await s.services.catalogue.updateProduct(s.owner.id, product.id, {
      ...product,
      price: 6000,
      recipe: [
        { ingredientId: s.flour.id, quantity: 300 },
        { ingredientId: s.sugar.id, quantity: 50 },
      ],
      changeNote: 'Bigger brownies',
    });
    expect(newVersion).toBe(true);
    expect(updated.version).toBe(2);

    // The existing order keeps its price and the flour it reserved under version 1.
    expect(s.db.getState().orders[order.id].items[0]).toMatchObject({ unitPrice: 5000, productVersion: 1 });
    await s.services.orders.updateStatus(s.kitchen.id, order.id, 'preparing');
    expect(s.db.getState().ingredients[s.flour.id].stock).toBe(9800);

    // New orders use version 2.
    const next = await s.order(s.bob, 1);
    expect(next.items[0]).toMatchObject({ unitPrice: 6000, productVersion: 2 });
    expect(s.db.getState().ingredients[s.flour.id].reserved).toBe(300);
  });

  it('does not create a version for description-only edits', async () => {
    const s = await createScenario();
    const product = s.db.getState().products[s.product.id];
    const { newVersion } = await s.services.catalogue.updateProduct(s.owner.id, product.id, { ...product, description: 'Even fudgier' });
    expect(newVersion).toBe(false);
  });
});

describe('kitchen tasks (Sprint 2)', () => {
  it('generates one task per option and protects other people’s tasks', async () => {
    const s = await createScenario();
    await s.order(s.alice, 2, 0);
    await s.order(s.bob, 1, 1);
    const created = await s.services.production.generateBatchTasks(s.owner.id, s.batch.id, s.kitchen.id);
    expect(created).toBe(2);
    const titles = Object.values(s.db.getState().tasks).map((t) => t.title).sort();
    expect(titles).toEqual(['Make 1 × Brownie (Extra sweet)', 'Make 2 × Brownie (Classic)']);
    const task = Object.values(s.db.getState().tasks)[0];
    await s.services.production.setTaskStatus(s.kitchen.id, task.id, 'done');
    expect(s.db.getState().tasks[task.id].status).toBe('done');
    await expect(s.services.production.generateBatchTasks(s.owner.id, s.batch.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
