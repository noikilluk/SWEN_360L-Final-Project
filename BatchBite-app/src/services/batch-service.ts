/**
 * Production batches and pickup slots (US-06, FR-03, FR-05, FR-06).
 *
 * Sprint 2 refinement: pickup slots are tied to a collection day. A cart may
 * only hold batches that collect on the same day, and the customer chooses a
 * slot on that day that starts no earlier than the batches' collection time.
 */
import type { Transaction } from '@/data/database';
import { ensure } from '@/domain/errors';
import { requireCapability } from '@/domain/permissions';
import { mergeLines, scaleLines, unitRecipe } from '@/domain/recipe';
import { addMinutes, formatTime, isSameDay, toDate } from '@/domain/time';
import type { Batch, ID, IngredientReservation, PickupSlot, Product } from '@/domain/types';
import { validatePositiveInteger } from '@/domain/validation';

import { type ServiceContext, loadActor } from './context';

export interface BatchInput {
  productId: ID;
  maxQuantity: number;
  orderDeadline: Date;
  collectionStart: Date;
}

export interface SlotPlan {
  count: number;
  minutes: number;
  capacity: number;
}

export class BatchService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Creates a batch as a draft, or publishes it straight away. */
  createBatch(actorId: ID, input: BatchInput, options: { publish: boolean; slots?: SlotPlan }): Promise<Batch> {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'manageBatches');
      this.validate(tx, input, options.publish);
      const now = this.ctx.now().toISOString();
      const batch: Batch = {
        id: this.ctx.crypto.randomId(),
        productId: input.productId,
        maxQuantity: input.maxQuantity,
        remainingQuantity: input.maxQuantity,
        orderDeadline: input.orderDeadline.toISOString(),
        collectionStart: input.collectionStart.toISOString(),
        status: options.publish ? 'published' : 'draft',
        createdAt: now,
        createdBy: actorId,
        publishedAt: options.publish ? now : undefined,
      };
      tx.put('batches', batch);
      if (options.publish) this.ensureSlots(tx, batch, options.slots);
      return batch;
    });
  }

  updateBatch(actorId: ID, batchId: ID, input: BatchInput, options: { publish: boolean; slots?: SlotPlan }) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageBatches');
      const existing = tx.require('batches', batchId, 'batch');
      ensure(existing.status !== 'completed', 'CONFLICT', 'Completed batches cannot be edited.');
      const publish = options.publish || existing.status === 'published';
      this.validate(tx, input, publish);

      const sold = existing.maxQuantity - existing.remainingQuantity;
      ensure(
        input.maxQuantity >= sold,
        'VALIDATION',
        `${sold} units are already ordered, so the maximum cannot be lower than that.`,
      );
      const hasOrders = tx.all('orders').some((o) => o.items.some((i) => i.batchId === batchId));
      ensure(
        !hasOrders || isSameDay(existing.collectionStart, input.collectionStart),
        'CONFLICT',
        'Customers have already booked pickup slots for this batch, so the collection day cannot change.',
      );
      ensure(input.productId === existing.productId || !hasOrders, 'CONFLICT', 'The product cannot change once orders exist.');

      const now = this.ctx.now().toISOString();
      const batch: Batch = {
        ...existing,
        productId: input.productId,
        maxQuantity: input.maxQuantity,
        remainingQuantity: input.maxQuantity - sold,
        orderDeadline: input.orderDeadline.toISOString(),
        collectionStart: input.collectionStart.toISOString(),
        status: publish ? 'published' : 'draft',
        publishedAt: existing.publishedAt ?? (publish ? now : undefined),
      };
      tx.put('batches', batch);
      if (publish) this.ensureSlots(tx, batch, options.slots);
      return batch;
    });
  }

  publishBatch(actorId: ID, batchId: ID) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageBatches');
      const batch = tx.require('batches', batchId, 'batch');
      ensure(batch.status === 'draft', 'CONFLICT', 'Only drafts can be published.');
      this.validate(
        tx,
        {
          productId: batch.productId,
          maxQuantity: batch.maxQuantity,
          orderDeadline: toDate(batch.orderDeadline),
          collectionStart: toDate(batch.collectionStart),
        },
        true,
      );
      const published = tx.put('batches', { ...batch, status: 'published', publishedAt: this.ctx.now().toISOString() });
      this.ensureSlots(tx, published);
      return published;
    });
  }

  /** Marks production as finished. The batch leaves the customer home screen and the board. */
  completeBatch(actorId: ID, batchId: ID) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageBatches');
      const batch = tx.require('batches', batchId, 'batch');
      ensure(batch.status === 'published', 'CONFLICT', 'Only published batches can be completed.');
      const open = tx
        .all('orders')
        .filter((o) => ['confirmed', 'preparing'].includes(o.status) && o.items.some((i) => i.batchId === batchId));
      ensure(
        open.length === 0,
        'CONFLICT',
        `${open.length} order(s) are still waiting for production. Move them to Ready or cancel them first.`,
      );
      tx.put('batches', { ...batch, status: 'completed', completedAt: this.ctx.now().toISOString() });
    });
  }

  deleteDraft(actorId: ID, batchId: ID) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageBatches');
      const batch = tx.require('batches', batchId, 'batch');
      ensure(batch.status === 'draft', 'CONFLICT', 'Only drafts can be deleted.');
      tx.delete('batches', batchId);
    });
  }

  generateSlots(actorId: ID, start: Date, plan: SlotPlan): Promise<PickupSlot[]> {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageSlots');
      return this.createSlots(tx, start, plan);
    });
  }

  updateSlotCapacity(actorId: ID, slotId: ID, maxOrders: number) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageSlots');
      const slot = tx.require('slots', slotId, 'pickup slot');
      const problem = validatePositiveInteger(maxOrders, 'the order limit', 200);
      ensure(!problem, 'VALIDATION', problem ?? '');
      ensure(
        maxOrders >= slot.reservedOrders,
        'VALIDATION',
        `${slot.reservedOrders} orders already use this slot, so the limit cannot be lower.`,
      );
      tx.put('slots', { ...slot, maxOrders });
    });
  }

  deleteSlot(actorId: ID, slotId: ID) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageSlots');
      const slot = tx.require('slots', slotId, 'pickup slot');
      ensure(slot.reservedOrders === 0, 'CONFLICT', 'Orders are booked in this slot, so it cannot be removed.');
      tx.delete('slots', slotId);
    });
  }

  private validate(tx: Transaction, input: BatchInput, publishing: boolean) {
    const product = tx.require('products', input.productId, 'product');
    ensure(product.active, 'VALIDATION', `${product.name} is hidden. Show it again before creating a batch.`);
    const quantityProblem = validatePositiveInteger(input.maxQuantity, 'the maximum quantity', 10_000);
    ensure(!quantityProblem, 'VALIDATION', quantityProblem ?? '');
    ensure(!Number.isNaN(input.orderDeadline.getTime()), 'VALIDATION', 'Choose an order deadline.');
    ensure(!Number.isNaN(input.collectionStart.getTime()), 'VALIDATION', 'Choose a collection date and time.');
    ensure(
      input.collectionStart.getTime() > input.orderDeadline.getTime(),
      'VALIDATION',
      'Collection must start after the order deadline.',
    );
    if (publishing) {
      ensure(
        input.orderDeadline.getTime() > this.ctx.now().getTime(),
        'VALIDATION',
        'The order deadline has already passed. Choose a later time to publish.',
      );
    }
  }

  /** Makes sure the collection day has at least one slot at or after the batch's start time. */
  private ensureSlots(tx: Transaction, batch: Batch, plan?: SlotPlan) {
    const start = toDate(batch.collectionStart);
    const existing = tx
      .all('slots')
      .filter((s) => isSameDay(s.start, start) && toDate(s.start).getTime() >= start.getTime());
    if (plan) {
      this.createSlots(tx, start, plan);
    } else if (existing.length === 0) {
      const settings = tx.read('settings');
      this.createSlots(tx, start, {
        count: settings.defaultSlotsPerBatch,
        minutes: settings.defaultSlotMinutes,
        capacity: settings.defaultSlotCapacity,
      });
    }
  }

  private createSlots(tx: Transaction, start: Date, plan: SlotPlan): PickupSlot[] {
    const countProblem =
      validatePositiveInteger(plan.count, 'the number of slots', 24) ??
      validatePositiveInteger(plan.minutes, 'the slot length', 240) ??
      validatePositiveInteger(plan.capacity, 'the orders per slot', 200);
    ensure(!countProblem, 'VALIDATION', countProblem ?? '');

    const created: PickupSlot[] = [];
    const taken = new Set(tx.all('slots').map((s) => toDate(s.start).getTime()));
    for (let i = 0; i < plan.count; i++) {
      const slotStart = addMinutes(start, i * plan.minutes);
      if (!isSameDay(slotStart, start)) break; // Never spill into the next day.
      if (taken.has(slotStart.getTime())) continue;
      created.push(
        tx.put('slots', {
          id: this.ctx.crypto.randomId(),
          start: slotStart.toISOString(),
          end: addMinutes(slotStart, plan.minutes).toISOString(),
          maxOrders: plan.capacity,
          reservedOrders: 0,
        }),
      );
    }
    ensure(
      created.length > 0 || plan.count === 0,
      'CONFLICT',
      `Slots already exist from ${formatTime(start)} on that day.`,
    );
    return created;
  }
}

/**
 * Ingredients needed to make `quantity` units of a product, assuming an even
 * mix of its options. Used to warn owners before they publish a batch.
 */
export function estimateBatchNeeds(product: Product, quantity: number): IngredientReservation[] {
  if (product.variants.length === 0) return scaleLines(product.recipe, quantity);
  const perVariant = quantity / product.variants.length;
  return mergeLines(product.variants.flatMap((v) => scaleLines(unitRecipe(product, v.id), perVariant)));
}
