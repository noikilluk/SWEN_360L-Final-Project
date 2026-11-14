import { AppError } from '@/domain/errors';
import { addMinutes } from '@/domain/time';
import { findInvariantViolations } from '@/test-utils/invariants';
import { createScenario } from '@/test-utils/scenario';

/** Expects a promise to reject with an AppError carrying `code`. */
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('checkout (US-03, FR-04 to FR-07)', () => {
  it('reserves stock, the pickup slot and ingredients, takes a simulated payment and clears the cart', async () => {
    const s = await createScenario();
    const order = await s.order(s.alice, 2, 1);
    const state = s.db.getState();

    expect(order.status).toBe('confirmed');
    expect(order.number).toMatch(/^BB-\d+$/);
    expect(order.collectionCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(order.total).toBe(10_000);
    expect(order.items[0]).toMatchObject({ quantity: 2, unitPrice: 5000, variantName: 'Extra sweet', productVersion: 1 });
    expect(state.batches[s.batch.id].remainingQuantity).toBe(8);
    expect(state.slots[s.slots[0].id].reservedOrders).toBe(1);
    // 2 × (100 g flour) and 2 × (50 g + 20 g extra sugar)
    expect(state.ingredients[s.flour.id].reserved).toBe(200);
    expect(state.ingredients[s.sugar.id].reserved).toBe(140);
    const payments = Object.values(state.payments).filter((p) => p.orderId === order.id);
    expect(payments).toEqual([expect.objectContaining({ kind: 'charge', amount: 10_000, cardLast4: '1337' })]);
    expect(state.carts[s.alice.id].items).toHaveLength(0);
    const kinds = Object.values(state.notifications).map((n) => n.kind);
    expect(kinds).toEqual(expect.arrayContaining(['order_confirmed', 'new_order']));
    expect(findInvariantViolations(state)).toEqual([]);
  });

  it('FR-04: rejects an order when the batch no longer has enough units', async () => {
    const s = await createScenario({ maxQuantity: 3 });
    await s.services.cart.addItem(s.alice.id, s.batch.id, s.product.variants[0].id, 3);
    await s.services.cart.selectSlot(s.alice.id, s.slots[0].id);
    await s.order(s.bob, 2); // Bob buys first, leaving 1.
    await expectCode(s.services.orders.checkout(s.alice.id), 'SOLD_OUT');
    await expectCode(s.services.cart.addItem(s.alice.id, s.batch.id, s.product.variants[0].id, 5), 'SOLD_OUT');
    expect(s.db.getState().batches[s.batch.id].remainingQuantity).toBe(1);
  });

  it('FR-05: closes ordering automatically after the deadline', async () => {
    const s = await createScenario();
    await s.services.cart.addItem(s.alice.id, s.batch.id, s.product.variants[0].id, 1);
    await s.services.cart.selectSlot(s.alice.id, s.slots[0].id);
    s.clock.set(addMinutes(s.deadline, 1));
    await expectCode(s.services.orders.checkout(s.alice.id), 'ORDERING_CLOSED');
    await expectCode(s.services.cart.addItem(s.bob.id, s.batch.id, s.product.variants[0].id, 1), 'ORDERING_CLOSED');
  });

  it('FR-06: a full pickup slot cannot be booked', async () => {
    const s = await createScenario({ slotCapacity: 1 });
    await s.order(s.alice, 1, 0, 0);
    await expectCode(s.order(s.bob, 1, 0, 0), 'SLOT_FULL');
    const second = await s.order(s.bob, 1, 0, 1);
    expect(second.slotId).toBe(s.slots[1].id);
  });

  it('NFR-01: two simultaneous checkouts never both get the last unit', async () => {
    const s = await createScenario({ maxQuantity: 1 });
    for (const customer of [s.alice, s.bob]) {
      await s.services.cart.addItem(customer.id, s.batch.id, s.product.variants[0].id, 1);
      await s.services.cart.selectSlot(customer.id, s.slots[0].id);
    }
    const results = await Promise.allSettled([s.services.orders.checkout(s.alice.id), s.services.orders.checkout(s.bob.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'SOLD_OUT' });
    expect(s.db.getState().batches[s.batch.id].remainingQuantity).toBe(0);
    expect(findInvariantViolations(s.db.getState())).toEqual([]);
  });

  it('rejects orders the kitchen has no ingredients for, unless the check is switched off', async () => {
    const s = await createScenario({ flourStock: 150 });
    await expectCode(s.order(s.alice, 2), 'INSUFFICIENT_INGREDIENTS');
    expect(s.db.getState().ingredients[s.flour.id].reserved).toBe(0);
    await s.services.admin.updateSettings(s.admin.id, { enforceIngredientStock: false });
    await expect(s.services.orders.checkout(s.alice.id)).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('keeps one order to one collection day', async () => {
    const s = await createScenario();
    const otherDay = await s.services.batches.createBatch(
      s.owner.id,
      { productId: s.product.id, maxQuantity: 5, orderDeadline: s.deadline, collectionStart: addMinutes(s.collection, 24 * 60) },
      { publish: true },
    );
    await s.services.cart.addItem(s.alice.id, s.batch.id, s.product.variants[0].id, 1);
    await expectCode(s.services.cart.addItem(s.alice.id, otherDay.id, s.product.variants[0].id, 1), 'CART_DATE_CONFLICT');
    const cart = await s.services.cart.addItem(s.alice.id, otherDay.id, s.product.variants[0].id, 1, { replaceCart: true });
    expect(cart.items.map((i) => i.batchId)).toEqual([otherDay.id]);
  });

  it('only customers can check out, and only owners can manage products', async () => {
    const s = await createScenario();
    await expectCode(s.services.cart.addItem(s.owner.id, s.batch.id, s.product.variants[0].id, 1), 'FORBIDDEN');
    await expectCode(
      s.services.catalogue.createProduct(s.alice.id, {
        name: 'Nope',
        description: '',
        price: 100,
        emoji: '🍪',
        variants: [{ id: 'new:a', name: 'A' }],
        recipe: [],
        variantRecipes: {},
      }),
      'FORBIDDEN',
    );
  });
});
