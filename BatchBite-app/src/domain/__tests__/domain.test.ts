import { batchBadges, canOrder, eligibleSlots, findNextBatch, isOpen, remainingRatio } from '@/domain/batch';
import { computeInsights } from '@/domain/insights';
import { formatMoney, parseMoney } from '@/domain/money';
import { ORDER_TRANSITIONS, assertTransition, canTransition } from '@/domain/order-state';
import { can } from '@/domain/permissions';
import { findShortfalls, formatQuantity, mergeLines, unitRecipe } from '@/domain/recipe';
import { formatDateTime, formatDuration, formatRelativeDay } from '@/domain/time';
import type { Batch, Ingredient, PickupSlot } from '@/domain/types';
import { validatePassword, validateUsername } from '@/domain/validation';
import { TEST_NOW, createTestApp } from '@/test-utils/setup';

describe('money', () => {
  it('formats fils as dinars', () => {
    expect(formatMoney(4500)).toBe('BD 4.50');
    expect(formatMoney(4525)).toBe('BD 4.525');
    expect(formatMoney(-1500)).toBe('-BD 1.50');
  });
  it('parses typed amounts', () => {
    expect(parseMoney('4.5')).toBe(4500);
    expect(parseMoney('BD 12.000')).toBe(12_000);
    expect(parseMoney('3')).toBe(3000);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.2345')).toBeNull();
  });
});

describe('order state machine (design section 7)', () => {
  it('allows only the transitions in the state diagram', () => {
    expect(canTransition('confirmed', 'preparing')).toBe(true);
    expect(canTransition('confirmed', 'collected')).toBe(false);
    expect(canTransition('preparing', 'cancelled')).toBe(false);
    expect(canTransition('ready', 'collected')).toBe(true);
    expect(ORDER_TRANSITIONS.collected).toEqual([]);
    expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
  });
  it('checks who may make each change', () => {
    expect(() => assertTransition('confirmed', 'cancelled', 'owner')).not.toThrow();
    expect(() => assertTransition('confirmed', 'cancelled', 'kitchen')).toThrow(/not allowed/);
    expect(() => assertTransition('ready', 'missed', 'system')).not.toThrow();
    expect(() => assertTransition('confirmed', 'collected', 'owner')).toThrow(/cannot be changed/);
  });
});

describe('permissions', () => {
  it('matches the roles in the requirements', () => {
    expect(can({ role: 'owner' }, 'manageProducts')).toBe(true);
    expect(can({ role: 'kitchen' }, 'manageProducts')).toBe(false);
    expect(can({ role: 'kitchen' }, 'updateProduction')).toBe(true);
    expect(can({ role: 'customer' }, 'viewAllOrders')).toBe(false);
    expect(can({ role: 'admin' }, 'manageUsers')).toBe(true);
    expect(can(null, 'placeOrders')).toBe(false);
  });
});

describe('batches', () => {
  const batch: Batch = {
    id: 'b1',
    productId: 'p1',
    maxQuantity: 40,
    remainingQuantity: 12,
    orderDeadline: new Date(2026, 9, 19, 18, 0).toISOString(),
    collectionStart: new Date(2026, 9, 19, 20, 0).toISOString(),
    status: 'published',
    createdAt: TEST_NOW.toISOString(),
    createdBy: 'o',
  };
  it('is open until the deadline (FR-05)', () => {
    expect(isOpen(batch, TEST_NOW)).toBe(true);
    expect(isOpen(batch, new Date(2026, 9, 19, 18, 0))).toBe(false);
    expect(canOrder({ ...batch, remainingQuantity: 0 }, TEST_NOW)).toBe(false);
  });
  it('shows the wireframe badges', () => {
    expect(batchBadges(batch, TEST_NOW, { closingSoonHours: 24 })).toEqual(['closing_soon', 'pickup_today']);
    expect(batchBadges({ ...batch, remainingQuantity: 0 }, TEST_NOW, { closingSoonHours: 24 })[0]).toBe('sold_out');
    expect(remainingRatio(batch)).toBeCloseTo(0.3);
  });
  it('finds the next batch of a sold-out product', () => {
    const later = { ...batch, id: 'b2', remainingQuantity: 30, orderDeadline: new Date(2026, 9, 25).toISOString(), collectionStart: new Date(2026, 9, 26, 10).toISOString() };
    expect(findNextBatch({ ...batch, remainingQuantity: 0 }, [batch, later], TEST_NOW)?.id).toBe('b2');
  });
  it('offers only slots on the collection day, after collection starts', () => {
    const slot = (id: string, h: number, day = 19): PickupSlot => ({
      id,
      start: new Date(2026, 9, day, h).toISOString(),
      end: new Date(2026, 9, day, h, 30).toISOString(),
      maxOrders: 5,
      reservedOrders: 0,
    });
    const result = eligibleSlots([slot('early', 19), slot('ok', 20), slot('next-day', 20, 20)], [batch.collectionStart], TEST_NOW);
    expect(result.map((s) => s.id)).toEqual(['ok']);
  });
});

describe('recipes', () => {
  const ingredient = (id: string, stock: number, reserved: number): Ingredient => ({
    id,
    name: id,
    unit: 'g',
    stock,
    reserved,
    lowStockThreshold: 0,
    costPerUnit: 1,
    allergens: [],
    updatedAt: '',
  });
  it('merges base and option recipes', () => {
    const lines = unitRecipe(
      { recipe: [{ ingredientId: 'flour', quantity: 100 }], variantRecipes: { choc: [{ ingredientId: 'flour', quantity: 10 }, { ingredientId: 'cocoa', quantity: 5 }] } },
      'choc',
    );
    expect(lines).toEqual([
      { ingredientId: 'flour', quantity: 110 },
      { ingredientId: 'cocoa', quantity: 5 },
    ]);
    expect(mergeLines([{ ingredientId: 'a', quantity: 0 }])).toEqual([]);
  });
  it('reports shortfalls against free stock', () => {
    const shortfalls = findShortfalls([{ ingredientId: 'flour', quantity: 500 }], { flour: ingredient('flour', 600, 300) });
    expect(shortfalls).toEqual([expect.objectContaining({ needed: 500, available: 300, missing: 200 })]);
    expect(formatQuantity(2500, 'g')).toBe('2.5 kg');
  });
});

describe('validation and time', () => {
  it('validates usernames and passwords', () => {
    expect(validateUsername('ok_name')).toBeNull();
    expect(validateUsername('no spaces')).not.toBeNull();
    expect(validatePassword('1234567')).not.toBeNull();
    expect(validatePassword('12345678')).toBeNull();
  });
  it('formats dates like the wireframes', () => {
    expect(formatDateTime(new Date(2026, 9, 20, 18, 0))).toBe('Tue 20 Oct, 6:00 pm');
    expect(formatRelativeDay(new Date(2026, 9, 20), TEST_NOW)).toBe('tomorrow');
    expect(formatDuration(200 * 60_000)).toBe('3 h 20 min');
  });
});

describe('insights', () => {
  it('summarises the demo data consistently', async () => {
    const { db } = await createTestApp();
    const insights = computeInsights(db.getState(), TEST_NOW, 14);
    expect(insights.daily).toHaveLength(14);
    expect(insights.netRevenue).toBe(insights.grossSales - insights.refunds);
    expect(insights.daily.reduce((sum, d) => sum + d.revenue, 0)).toBe(insights.netRevenue);
    expect(insights.orderCount).toBeGreaterThan(0);
    expect(insights.collectionRate).toBeGreaterThan(0.5);
    expect(insights.topProducts[0].units).toBeGreaterThanOrEqual(insights.topProducts[1].units);
  });
});
