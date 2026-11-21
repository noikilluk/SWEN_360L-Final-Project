/**
 * A small, fully controlled data set for service tests: one owner, kitchen,
 * admin and two customers, two ingredients, one product with two options and
 * one published batch with two pickup slots.
 */
import { addDays, combineDayAndTime, startOfDay } from '@/domain/time';
import type { User, UserRole } from '@/domain/types';
import { NEW_VARIANT_PREFIX } from '@/services/catalogue-service';

import { TEST_NOW, createTestApp, nodeCrypto } from './setup';

export const PASSWORD = 'correct-horse';

export interface ScenarioOptions {
  maxQuantity?: number;
  slotCapacity?: number;
  flourStock?: number;
}

export async function createScenario(options: ScenarioOptions = {}) {
  const app = await createTestApp({ seed: false });
  const { db, services } = app;

  const makeUser = async (username: string, role: UserRole): Promise<User> => {
    const salt = nodeCrypto.newSalt();
    const user: User = {
      id: nodeCrypto.randomId(),
      username,
      displayName: username,
      salt,
      passwordHash: await nodeCrypto.hashPassword(PASSWORD, salt),
      role,
      active: true,
      mustChangePassword: false,
      createdAt: TEST_NOW.toISOString(),
    };
    await db.transaction((tx) => tx.put('users', user));
    return user;
  };

  const owner = await makeUser('owner', 'owner');
  const kitchen = await makeUser('kitchen', 'kitchen');
  const admin = await makeUser('admin', 'admin');
  const alice = await makeUser('alice', 'customer');
  const bob = await makeUser('bob', 'customer');

  const flour = await services.catalogue.createIngredient(owner.id, {
    name: 'Flour',
    unit: 'g',
    stock: options.flourStock ?? 10_000,
    lowStockThreshold: 500,
    costPerUnit: 0.5,
    allergens: ['Gluten'],
  });
  const sugar = await services.catalogue.createIngredient(owner.id, {
    name: 'Sugar',
    unit: 'g',
    stock: 10_000,
    lowStockThreshold: 500,
    costPerUnit: 0.4,
    allergens: [],
  });

  const product = await services.catalogue.createProduct(owner.id, {
    name: 'Brownie',
    description: 'Fudgy',
    price: 5000,
    emoji: '🍫',
    variants: [
      { id: `${NEW_VARIANT_PREFIX}classic`, name: 'Classic' },
      { id: `${NEW_VARIANT_PREFIX}extra`, name: 'Extra sweet' },
    ],
    recipe: [
      { ingredientId: flour.id, quantity: 100 },
      { ingredientId: sugar.id, quantity: 50 },
    ],
    variantRecipes: { [`${NEW_VARIANT_PREFIX}extra`]: [{ ingredientId: sugar.id, quantity: 20 }] },
  });

  const deadline = combineDayAndTime(addDays(startOfDay(TEST_NOW), 1), 18, 0);
  const collection = combineDayAndTime(addDays(startOfDay(TEST_NOW), 2), 16, 0);
  const batch = await services.batches.createBatch(
    owner.id,
    { productId: product.id, maxQuantity: options.maxQuantity ?? 10, orderDeadline: deadline, collectionStart: collection },
    { publish: true, slots: { count: 2, minutes: 30, capacity: options.slotCapacity ?? 5 } },
  );
  const slots = Object.values(db.getState().slots).sort((a, b) => a.start.localeCompare(b.start));

  /** Adds `quantity` of an option to a customer's cart, picks a slot and checks out. */
  const order = async (customer: User, quantity: number, variantIndex = 0, slotIndex = 0) => {
    await services.cart.addItem(customer.id, batch.id, product.variants[variantIndex].id, quantity);
    await services.cart.selectSlot(customer.id, slots[slotIndex].id);
    return services.orders.checkout(customer.id);
  };

  return { ...app, owner, kitchen, admin, alice, bob, flour, sugar, product, batch, slots, deadline, collection, order };
}
