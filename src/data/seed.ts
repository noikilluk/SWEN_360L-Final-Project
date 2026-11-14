/**
 * Demo data loaded on first launch (and by "Reset demo data").
 *
 * Instead of writing records by hand, the seed replays two weeks of activity
 * through the real services on an in-memory database with a simulated clock:
 * products are created, a price changes, batches are published, customers
 * check out, the kitchen prepares orders, some are cancelled, refunded or
 * missed. This guarantees the demo data obeys exactly the same rules as live
 * data. The result is written to storage in a single transaction.
 */
import { cartView } from '@/data/selectors';
import { slotPlacesLeft } from '@/domain/batch';
import { addDays, addMinutes, combineDayAndTime, startOfDay } from '@/domain/time';
import type {
  AppNotification,
  Batch,
  ID,
  IngredientUnit,
  Order,
  Product,
  User,
  UserRole,
} from '@/domain/types';
import { createServices } from '@/services';
import { NEW_VARIANT_PREFIX, checkLowStock } from '@/services/catalogue-service';
import type { CryptoProvider, ServiceContext } from '@/services/context';

import { Database } from './database';
import type { DbState } from './schema';

/** Password for every demo account. */
export const DEMO_PASSWORD = 'batchbite';

export const DEMO_ACCOUNTS: readonly { username: string; role: UserRole; displayName: string }[] = [
  { username: 'customer', role: 'customer', displayName: 'Demo Customer' },
  { username: 'owner', role: 'owner', displayName: 'Noura (Owner)' },
  { username: 'kitchen', role: 'kitchen', displayName: 'Hassan (Kitchen)' },
  { username: 'admin', role: 'admin', displayName: 'Site Admin' },
];

const OTHER_USERS: readonly { username: string; role: UserRole; displayName: string }[] = [
  { username: 'fatima', role: 'kitchen', displayName: 'Fatima (Kitchen)' },
  { username: 'sara', role: 'customer', displayName: 'Sara A.' },
  { username: 'omar', role: 'customer', displayName: 'Omar K.' },
  { username: 'yusuf', role: 'customer', displayName: 'Yusuf M.' },
  { username: 'maryam', role: 'customer', displayName: 'Maryam H.' },
];

interface IngredientSeed {
  key: string;
  name: string;
  unit: IngredientUnit;
  stock: number;
  threshold: number;
  cost: number;
  allergens: string[];
}

const INGREDIENTS: IngredientSeed[] = [
  { key: 'flour', name: 'Flour', unit: 'g', stock: 45_000, threshold: 3_000, cost: 0.5, allergens: ['Gluten'] },
  { key: 'sugar', name: 'Sugar', unit: 'g', stock: 30_000, threshold: 2_000, cost: 0.4, allergens: [] },
  { key: 'butter', name: 'Butter', unit: 'g', stock: 20_000, threshold: 1_500, cost: 3, allergens: ['Milk'] },
  { key: 'eggs', name: 'Eggs', unit: 'pcs', stock: 400, threshold: 30, cost: 50, allergens: ['Egg'] },
  { key: 'cocoa', name: 'Cocoa powder', unit: 'g', stock: 5_000, threshold: 400, cost: 4, allergens: [] },
  { key: 'chocolate', name: 'Dark chocolate', unit: 'g', stock: 15_000, threshold: 1_000, cost: 6, allergens: ['Milk', 'Soy'] },
  { key: 'milk', name: 'Milk', unit: 'ml', stock: 15_000, threshold: 1_500, cost: 0.6, allergens: ['Milk'] },
  { key: 'vanilla', name: 'Vanilla extract', unit: 'ml', stock: 800, threshold: 60, cost: 20, allergens: [] },
  { key: 'creamCheese', name: 'Cream cheese', unit: 'g', stock: 4_000, threshold: 500, cost: 4, allergens: ['Milk'] },
  { key: 'yeast', name: 'Yeast', unit: 'g', stock: 1_000, threshold: 100, cost: 5, allergens: [] },
  { key: 'lotus', name: 'Lotus Biscoff spread', unit: 'g', stock: 4_000, threshold: 250, cost: 8, allergens: ['Gluten', 'Soy'] },
  { key: 'icing', name: 'Icing sugar', unit: 'g', stock: 8_000, threshold: 600, cost: 0.6, allergens: [] },
  { key: 'oil', name: 'Frying oil', unit: 'ml', stock: 12_000, threshold: 1_000, cost: 0.8, allergens: [] },
];

type Lines = Record<string, number>;

interface ProductSeed {
  key: string;
  name: string;
  description: string;
  price: number;
  emoji: string;
  recipe: Lines;
  variants: Record<string, Lines>;
}

/** The five products from the wireframes (item pages 1 to 5). */
const PRODUCTS: ProductSeed[] = [
  {
    key: 'dessert',
    name: 'Dessert box',
    description: 'Four mini desserts, baked fresh.',
    price: 4000,
    emoji: '🍰',
    recipe: { flour: 120, sugar: 80, butter: 60, eggs: 1, milk: 50 },
    variants: { Chocolate: { cocoa: 15, chocolate: 30 }, Vanilla: { vanilla: 3 }, Mixed: { cocoa: 8, vanilla: 2 } },
  },
  {
    key: 'brownie',
    name: 'Brownie tray',
    description: 'A full tray of rich, freshly baked fudgy brownies.',
    price: 6500,
    emoji: '🍫',
    recipe: { flour: 200, sugar: 250, butter: 150, eggs: 3, cocoa: 60, chocolate: 150 },
    variants: { 'Classic Fudge': {}, 'Triple Chocolate': { chocolate: 100 }, 'Salted Caramel': { sugar: 50, butter: 20 } },
  },
  {
    key: 'cupcake',
    name: 'Cupcake set',
    description: 'A custom box of moist, freshly baked cupcakes topped with smooth buttercream.',
    price: 3500,
    emoji: '🧁',
    recipe: { flour: 180, sugar: 150, butter: 120, eggs: 2, milk: 80, icing: 120 },
    variants: {
      'Classic Vanilla': { vanilla: 4 },
      'Double Chocolate': { cocoa: 25, chocolate: 40 },
      'Red Velvet': { cocoa: 10, creamCheese: 60 },
      'Assorted Mix': { vanilla: 2, cocoa: 10 },
    },
  },
  {
    key: 'cookie',
    name: 'Cookie pack',
    description: 'A box of thick, freshly baked cookies with a soft and gooey center.',
    price: 3000,
    emoji: '🍪',
    recipe: { flour: 150, sugar: 100, butter: 90, eggs: 1 },
    variants: { 'Chunky Chocolate': { chocolate: 80 }, 'Double Chocolate': { cocoa: 20, chocolate: 60 }, 'Lotus Biscoff': { lotus: 60 } },
  },
  {
    key: 'donut',
    name: 'Donut Box',
    description: 'A selection of fluffy, freshly glazed donuts with premium toppings.',
    price: 3000,
    emoji: '🍩',
    recipe: { flour: 250, sugar: 60, milk: 120, eggs: 2, yeast: 7, butter: 40, oil: 150 },
    variants: { 'Original Glaze': { icing: 80 }, 'Chocolate Sprinkles': { chocolate: 50 }, 'Boston Cream': { milk: 100, vanilla: 3, chocolate: 30 } },
  },
];

const QUANTITY_PATTERN = [2, 1, 3, 2, 1, 4, 2, 3, 1, 2];
const SLOT_PATTERN = [2, 0, 2, 1, 2, 3, 0, 2, 1, 3, 0, 1];
const NOTES = ['', 'No nuts please', '', 'Please add a birthday candle', '', '', 'I will be a few minutes late'];

/**
 * Builds the demo data set relative to `realNow` and returns it, without
 * touching any persistent storage.
 */
export async function buildDemoState(crypto: CryptoProvider, realNow: Date): Promise<DbState> {
  const db = Database.inMemory();
  let clock = new Date(realNow);
  const ctx: ServiceContext = { db, crypto, now: () => new Date(clock) };
  const s = createServices(ctx);
  /** Moves the simulated clock, never past the real time. */
  const at = (date: Date) => {
    clock = new Date(Math.min(date.getTime(), realNow.getTime() - 60_000));
  };
  const day = (offset: number, hours: number, minutes = 0) =>
    combineDayAndTime(addDays(startOfDay(realNow), offset), hours, minutes);

  // --- Accounts --------------------------------------------------------------
  at(day(-14, 9));
  const users: Record<string, ID> = {};
  const userRecords: User[] = [];
  for (const account of [...DEMO_ACCOUNTS, ...OTHER_USERS]) {
    const salt = crypto.newSalt();
    const record: User = {
      id: crypto.randomId(),
      username: account.username,
      displayName: account.displayName,
      salt,
      passwordHash: await crypto.hashPassword(DEMO_PASSWORD, salt),
      role: account.role,
      active: true,
      mustChangePassword: false,
      createdAt: clock.toISOString(),
    };
    users[account.username] = record.id;
    userRecords.push(record);
  }
  await db.transaction((tx) => userRecords.forEach((u) => tx.put('users', u)));
  const owner = users.owner;
  const kitchen = users.kitchen;
  const customers = ['sara', 'omar', 'yusuf', 'maryam'].map((u) => users[u]);

  // --- Ingredients and products ---------------------------------------------
  const ingredientIds: Record<string, ID> = {};
  for (const seed of INGREDIENTS) {
    const created = await s.catalogue.createIngredient(owner, {
      name: seed.name,
      unit: seed.unit,
      stock: seed.stock,
      lowStockThreshold: seed.threshold,
      costPerUnit: seed.cost,
      allergens: seed.allergens,
    });
    ingredientIds[seed.key] = created.id;
  }
  const toLines = (lines: Lines) =>
    Object.entries(lines).map(([key, quantity]) => ({ ingredientId: ingredientIds[key], quantity }));

  const products: Record<string, Product> = {};
  for (const seed of PRODUCTS) {
    const variantNames = Object.keys(seed.variants);
    products[seed.key] = await s.catalogue.createProduct(owner, {
      name: seed.name,
      description: seed.description,
      price: seed.price,
      emoji: seed.emoji,
      variants: variantNames.map((name) => ({ id: `${NEW_VARIANT_PREFIX}${name}`, name })),
      recipe: toLines(seed.recipe),
      variantRecipes: Object.fromEntries(
        variantNames.map((name) => [`${NEW_VARIANT_PREFIX}${name}`, toLines(seed.variants[name])]),
      ),
      changeNote: 'First version',
    });
  }
  const variantId = (key: string, name: string) => products[key].variants.find((v) => v.name === name)?.id ?? '';
  const variantNames = (key: string) => products[key].variants.map((v) => v.name);

  // --- Helpers ----------------------------------------------------------------
  const publish = async (key: string, maxQuantity: number, deadline: Date, collection: Date) =>
    s.batches.createBatch(
      owner,
      { productId: products[key].id, maxQuantity, orderDeadline: deadline, collectionStart: collection },
      { publish: true },
    );

  interface PlanEntry {
    customer: ID;
    variant: string;
    quantity: number;
    note?: string;
  }

  const makePlan = (key: string, units: number, buyers: ID[], offset = 0): PlanEntry[] => {
    const plan: PlanEntry[] = [];
    const names = variantNames(key);
    let left = units;
    let i = offset;
    while (left > 0) {
      const quantity = Math.min(left, QUANTITY_PATTERN[i % QUANTITY_PATTERN.length]);
      plan.push({
        customer: buyers[i % buyers.length],
        variant: names[i % names.length],
        quantity,
        note: NOTES[i % NOTES.length] || undefined,
      });
      left -= quantity;
      i += 1;
    }
    return plan;
  };

  /** Places orders through the cart and checkout, spread between two times. */
  const placeOrders = async (key: string, batch: Batch, plan: PlanEntry[], from: Date, to: Date) => {
    const orders: Order[] = [];
    for (let i = 0; i < plan.length; i++) {
      const entry = plan[i];
      at(new Date(from.getTime() + ((to.getTime() - from.getTime()) * (i + 1)) / (plan.length + 1)));
      await s.cart.addItem(entry.customer, batch.id, variantId(key, entry.variant), entry.quantity, { replaceCart: true });
      const slots = cartView(db.getState(), entry.customer, clock).slots.filter((slot) => slotPlacesLeft(slot) > 0);
      const preferred = slots[SLOT_PATTERN[i % SLOT_PATTERN.length] % Math.max(1, slots.length)];
      await s.cart.selectSlot(entry.customer, (preferred ?? slots[0])?.id);
      await s.cart.setNote(entry.customer, entry.note ?? '');
      orders.push(await s.orders.checkout(entry.customer));
    }
    return orders;
  };

  /** Runs collection day for a past batch: prepare, ready, collect, and mark no-shows as missed. */
  const runCollectionDay = async (batch: Batch, orders: Order[], missedIndexes: number[]) => {
    const collection = new Date(batch.collectionStart);
    const live = () => orders.map((o) => db.getState().orders[o.id]).filter((o) => o.status === 'confirmed');
    at(addMinutes(collection, -300));
    await s.orders.bulkUpdateStatus(kitchen, live().map((o) => o.id), 'preparing');
    at(addMinutes(collection, -45));
    const preparing = orders.map((o) => db.getState().orders[o.id]).filter((o) => o.status === 'preparing');
    await s.orders.bulkUpdateStatus(kitchen, preparing.map((o) => o.id), 'ready');
    for (let i = 0; i < orders.length; i++) {
      const order = db.getState().orders[orders[i].id];
      if (order.status !== 'ready' || missedIndexes.includes(i)) continue;
      at(addMinutes(order.slotStart, 8 + (i % 15)));
      await s.orders.confirmCollection(i % 3 === 0 ? owner : kitchen, order.id, order.collectionCode);
    }
    const lastEnd = Math.max(...orders.map((o) => new Date(o.slotEnd).getTime()));
    at(addMinutes(new Date(lastEnd), db.getState().settings.pickupGraceMinutes + 10));
    await s.orders.runScheduledChecks();
    at(addMinutes(new Date(lastEnd), 180));
    await s.batches.completeBatch(owner, batch.id);
  };

  // --- Past batch 1: Dessert box, collected six days ago ----------------------
  at(day(-10, 9));
  const pastDessert = await publish('dessert', 30, day(-7, 18), day(-6, 16));
  const pastDessertPlan = [
    { customer: users.customer, variant: 'Chocolate', quantity: 2, note: 'No nuts please' },
    ...makePlan('dessert', 28, customers, 1),
  ];
  const pastDessertOrders = await placeOrders('dessert', pastDessert, pastDessertPlan, day(-10, 10), day(-7, 16));
  at(day(-7, 17));
  await s.orders.cancel(owner, pastDessertOrders[4].id, 'Customer called to cancel.');
  await runCollectionDay(pastDessert, pastDessertOrders, [7]);

  // --- Price change: creates product version 2 --------------------------------
  at(day(-5, 10));
  const dessert = products.dessert;
  products.dessert = (
    await s.catalogue.updateProduct(owner, dessert.id, {
      name: dessert.name,
      description: dessert.description,
      price: 4500,
      emoji: dessert.emoji,
      variants: dessert.variants,
      recipe: dessert.recipe,
      variantRecipes: dessert.variantRecipes,
      changeNote: 'Butter prices went up',
    })
  ).product;

  // --- Past batch 2: Brownie tray, with an approved change request ------------
  at(day(-6, 9));
  const pastBrownie = await publish('brownie', 20, day(-4, 18), day(-3, 16));
  const pastBrownieOrders = await placeOrders('brownie', pastBrownie, makePlan('brownie', 20, customers, 3), day(-6, 10), day(-4, 15));
  at(day(-4, 16));
  const changeTarget = db.getState().orders[pastBrownieOrders[2].id];
  const request = await s.orders.requestChange(changeTarget.customerId, changeTarget.id, {
    type: 'modify',
    reason: 'We need one tray less, sorry!',
    items: changeTarget.items.map((item) => ({
      orderItemId: item.id,
      variantId: item.variantId,
      quantity: Math.max(1, item.quantity - 1),
    })),
  });
  at(day(-4, 16, 30));
  await s.orders.resolveRequest(owner, request.id, true, 'No problem, updated.');
  await runCollectionDay(pastBrownie, pastBrownieOrders, [5]);

  // --- Past batch 3: Cookie pack, collected yesterday -------------------------
  at(day(-4, 9));
  const pastCookie = await publish('cookie', 30, day(-2, 12), day(-1, 15));
  const pastCookieOrders = await placeOrders('cookie', pastCookie, makePlan('cookie', 26, customers, 5), day(-4, 10), day(-2, 11));
  at(day(-2, 11, 30));
  const refundTarget = pastCookieOrders[1];
  await runCollectionDay(pastCookie, pastCookieOrders, []);
  at(day(-1, 19));
  await s.orders.refund(owner, refundTarget.id, 1500, 'One cookie pack was broken.');

  // --- Current batches (match the wireframes) --------------------------------
  const roundUp = (date: Date, minutes: number) => {
    const ms = minutes * 60_000;
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  };
  at(day(-2, 10));
  const dessertBatch = await publish('dessert', 40, day(3, 18), day(5, 16));
  const brownieBatch = await publish('brownie', 20, roundUp(addMinutes(realNow, 300), 30), day(1, 16));
  const cookieBatch = await publish('cookie', 30, day(1, 12), day(2, 15));
  const donutBatch = await publish('donut', 30, day(2, 9), day(3, 10));
  at(day(-1, 9));
  const cupcakeDeadline = roundUp(addMinutes(realNow, 60), 30);
  const cupcakeBatch = await publish('cupcake', 24, cupcakeDeadline, addMinutes(cupcakeDeadline, 60));
  await publish('cookie', 30, day(5, 12), day(6, 15));
  await s.batches.createBatch(
    owner,
    { productId: products.brownie.id, maxQuantity: 20, orderDeadline: day(7, 18), collectionStart: day(8, 16) },
    { publish: false },
  );

  const recent = addMinutes(realNow, -20);
  const start = day(-1, 10);
  const dessertOrders = await placeOrders(
    'dessert',
    dessertBatch,
    [{ customer: users.customer, variant: 'Chocolate', quantity: 2, note: 'No nuts please' }, ...makePlan('dessert', 26, customers, 2)],
    start,
    recent,
  );
  await placeOrders('brownie', brownieBatch, makePlan('brownie', 14, customers, 4), start, recent);
  await placeOrders('cookie', cookieBatch, makePlan('cookie', 30, customers, 6), start, recent);
  await placeOrders('donut', donutBatch, makePlan('donut', 15, customers, 1), start, recent);
  const cupcakeOrders = await placeOrders(
    'cupcake',
    cupcakeBatch,
    [
      { customer: users.customer, variant: 'Double Chocolate', quantity: 2 },
      { customer: users.sara, variant: 'Classic Vanilla', quantity: 1 },
      { customer: users.omar, variant: 'Red Velvet', quantity: 3, note: 'Please add a birthday candle' },
    ],
    day(-1, 12),
    addMinutes(realNow, -90),
  );

  // Kitchen progress for today's pickup.
  at(addMinutes(realNow, -60));
  await s.orders.updateStatus(kitchen, cupcakeOrders[0].id, 'preparing');
  await s.orders.updateStatus(kitchen, cupcakeOrders[2].id, 'preparing');
  at(addMinutes(realNow, -15));
  await s.orders.updateStatus(kitchen, cupcakeOrders[0].id, 'ready');

  // A pending change request for the owner to review.
  at(addMinutes(realNow, -45));
  const saraOrder = dessertOrders.find((o) => o.customerId === users.sara);
  if (saraOrder) {
    const wanted = saraOrder.items[0].variantName === 'Vanilla' ? 'Mixed' : 'Vanilla';
    await s.orders.requestChange(users.sara, saraOrder.id, {
      type: 'modify',
      reason: `Could I switch to ${wanted} instead?`,
      items: saraOrder.items.map((item) => ({
        orderItemId: item.id,
        variantId: variantId('dessert', wanted),
        quantity: item.quantity,
      })),
    });
  }

  // Kitchen tasks.
  at(addMinutes(realNow, -40));
  await s.production.generateBatchTasks(owner, cupcakeBatch.id, kitchen);
  const firstTask = Object.values(db.getState().tasks)[0];
  if (firstTask) await s.production.setTaskStatus(kitchen, firstTask.id, 'in_progress');
  await s.production.createTask(owner, {
    title: 'Fold 40 dessert boxes and print labels',
    details: 'For Thursday’s Dessert box batch.',
    batchId: dessertBatch.id,
    assigneeId: users.fatima,
    dueAt: day(4, 12),
  });
  await s.production.createTask(owner, { title: 'Deep clean the oven trays', details: '' });

  // A forgotten password for the administrator to handle.
  at(addMinutes(realNow, -120));
  await s.auth.requestPasswordReset('omar');

  // Something in the demo customer's cart.
  at(addMinutes(realNow, -5));
  await s.cart.addItem(users.customer, donutBatch.id, variantId('donut', 'Original Glaze'), 1);

  // Make the Lotus spread run low so the warning shows.
  await db.transaction((tx) => {
    const lotus = tx.get('ingredients', ingredientIds.lotus);
    if (!lotus) return;
    const updated = { ...lotus, stock: Math.round(lotus.reserved + 180) };
    tx.put('ingredients', updated);
    checkLowStock(tx, ctx, lotus, updated);
  });

  // Keep inboxes short: the latest few per user, older ones already read.
  await db.transaction((tx) => {
    const byUser = new Map<ID, AppNotification[]>();
    for (const n of tx.all('notifications')) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
    const readBefore = addMinutes(realNow, -180).toISOString();
    for (const list of byUser.values()) {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      list.forEach((n, index) => {
        if (index >= 8) tx.delete('notifications', n.id);
        else if (n.createdAt < readBefore) tx.put('notifications', { ...n, read: true });
      });
    }
    tx.setDocument('meta', { ...tx.read('meta'), seededAt: realNow.toISOString() });
  });

  return db.getState();
}
