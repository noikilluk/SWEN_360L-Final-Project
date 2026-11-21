import { customerBatches } from '@/data/selectors';
import { canOrder, isSoldOut } from '@/domain/batch';
import { buildDemoState } from '@/data/seed';
import { TEST_NOW, createTestApp, nodeCrypto } from '@/test-utils/setup';
import { findInvariantViolations } from '@/test-utils/invariants';

describe('demo data', () => {
  it('builds a consistent data set through the real services', async () => {
    const { db } = await createTestApp();
    const state = db.getState();
    expect(findInvariantViolations(state)).toEqual([]);
    expect(Object.keys(state.users)).toHaveLength(9);
    expect(Object.keys(state.products)).toHaveLength(5);
    expect(Object.values(state.orders).length).toBeGreaterThan(40);
    expect(state.meta.seededAt).toBe(TEST_NOW.toISOString());
  });

  it('includes open, closing-soon and sold-out batches like the wireframes', async () => {
    const { db } = await createTestApp();
    const visible = customerBatches(db.getState(), TEST_NOW);
    const names = visible.map((v) => v.product.name);
    expect(names).toEqual(expect.arrayContaining(['Dessert box', 'Brownie tray', 'Cupcake set', 'Cookie pack', 'Donut Box']));
    expect(visible.some((v) => isSoldOut(v.batch))).toBe(true);
    expect(visible.filter((v) => canOrder(v.batch, TEST_NOW)).length).toBeGreaterThanOrEqual(4);
  });

  it.each([
    ['just after midnight', new Date(2026, 10, 14, 0, 5)],
    ['early morning', new Date(2026, 10, 14, 6, 30)],
    ['late evening', new Date(2026, 10, 14, 23, 50)],
    ['month end', new Date(2026, 11, 31, 21, 15)],
  ])('builds valid demo data %s', async (_label, when) => {
    const state = await buildDemoState(nodeCrypto, when);
    expect(findInvariantViolations(state)).toEqual([]);
    expect(customerBatches(state, when).filter((v) => canOrder(v.batch, when)).length).toBeGreaterThanOrEqual(4);
  });

  it('stores only password hashes', async () => {
    const { db } = await createTestApp();
    for (const user of Object.values(db.getState().users)) {
      expect(user.passwordHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(user)).not.toContain('batchbite"');
    }
  });
});
