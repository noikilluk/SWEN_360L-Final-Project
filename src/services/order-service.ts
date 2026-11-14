/**
 * Orders: checkout, the order life cycle, cancellations, refunds, change
 * requests, QR collection and missed pickups.
 * Covers US-03, US-05, US-08, FR-04 to FR-08, NFR-01 and the Sprint 2 features
 * "order changes and refund handling" and "QR code collection verification".
 */
import type { Transaction } from '@/data/database';
import { eligibleSlots, isOpen, isSlotAvailable } from '@/domain/batch';
import { AppError, ensure } from '@/domain/errors';
import { formatMoney } from '@/domain/money';
import { assertTransition, STATUS_LABELS } from '@/domain/order-state';
import { requireCapability } from '@/domain/permissions';
import { addMinutes, formatDay, formatTime, isSameDay, toDate } from '@/domain/time';
import type {
  ChangeRequest,
  Fils,
  ID,
  Order,
  OrderItem,
  OrderStatus,
  ProposedItemChange,
  User,
} from '@/domain/types';

import { type ServiceContext, loadActor } from './context';
import { notifyRoles, notifyUser } from './notification-service';
import {
  consumeIngredients,
  ingredientNeeds,
  itemsSummary,
  netPaid,
  nextOrderNumber,
  parseCollectionCode,
  paymentStatusFor,
  paymentSummary,
  recordPayment,
  refundText,
  releaseIngredients,
  releaseOrderHolds,
  reserveIngredients,
  uniqueCollectionCode,
  withStatus,
} from './order-helpers';

export interface ChangeRequestInput {
  type: 'modify' | 'cancel';
  reason: string;
  items?: ProposedItemChange[];
  slotId?: ID;
  note?: string;
}

export class OrderService {
  constructor(private readonly ctx: ServiceContext) {}

  /**
   * Turns the customer's cart into a confirmed order. Everything happens in one
   * serial transaction: stock, pickup slot and ingredients are checked and
   * reserved together, so the last unit can never be sold twice (NFR-01).
   */
  checkout(customerId: ID): Promise<Order> {
    return this.ctx.db.transaction((tx) => {
      const customer = loadActor(tx, customerId);
      requireCapability(customer, 'placeOrders');
      const now = this.ctx.now();
      const nowIso = now.toISOString();
      const settings = tx.read('settings');
      const cart = tx.get('carts', customerId);
      ensure(cart && cart.items.length > 0, 'VALIDATION', 'Your cart is empty.');
      ensure(cart.slotId, 'VALIDATION', 'Choose a pickup slot.');

      // 1. Validate every line and build the order items with locked prices.
      const items: OrderItem[] = [];
      const unitsPerBatch = new Map<ID, number>();
      for (const line of cart.items) {
        const batch = tx.require('batches', line.batchId, 'batch');
        const product = tx.require('products', batch.productId, 'product');
        const version = tx.require('productVersions', product.currentVersionId, 'product version');
        const variant = product.variants.find((v) => v.id === line.variantId);
        ensure(variant, 'VALIDATION', `The option you chose for ${product.name} is no longer offered. Remove it and add it again.`);
        ensure(isOpen(batch, now), 'ORDERING_CLOSED', `Ordering for ${product.name} closed at ${formatTime(batch.orderDeadline)}.`);
        unitsPerBatch.set(batch.id, (unitsPerBatch.get(batch.id) ?? 0) + line.quantity);
        items.push({
          id: this.ctx.crypto.randomId(),
          batchId: batch.id,
          productId: product.id,
          productVersionId: version.id,
          productVersion: version.version,
          productName: version.name,
          variantId: variant.id,
          variantName: variant.name,
          quantity: line.quantity,
          unitPrice: version.price,
        });
      }

      // 2. FR-04: reject the order if any batch cannot cover it.
      for (const [batchId, units] of unitsPerBatch) {
        const batch = tx.require('batches', batchId, 'batch');
        const name = tx.get('products', batch.productId)?.name ?? 'This item';
        if (batch.remainingQuantity <= 0) {
          throw new AppError('SOLD_OUT', `${name} has just sold out. Remove it from your cart to continue.`);
        }
        ensure(
          units <= batch.remainingQuantity,
          'SOLD_OUT',
          `Only ${batch.remainingQuantity} ${name} left. Lower the quantity to continue.`,
        );
      }

      // 3. FR-06: the pickup slot must be on the collection day and have room.
      const batches = [...unitsPerBatch.keys()].map((id) => tx.require('batches', id, 'batch'));
      const starts = batches.map((b) => b.collectionStart);
      ensure(
        starts.every((s) => isSameDay(s, starts[0])),
        'CART_DATE_CONFLICT',
        'Your cart has items for different collection days. Keep items for one day only.',
      );
      const slot = tx.require('slots', cart.slotId, 'pickup slot');
      ensure(
        eligibleSlots([slot], starts, now).length === 1,
        'VALIDATION',
        'That pickup slot is not available for these items. Choose another slot.',
      );
      ensure(isSlotAvailable(slot), 'SLOT_FULL', `The ${formatTime(slot.start)} slot is full. Choose another time.`);

      // 4. Ingredient stock reservations (uses the locked recipe version).
      const reservations = reserveIngredients(tx, this.ctx, ingredientNeeds(tx, items), settings.enforceIngredientStock);

      // 5. Reserve batch units and the slot place.
      for (const batch of batches) {
        tx.put('batches', { ...batch, remainingQuantity: batch.remainingQuantity - (unitsPerBatch.get(batch.id) ?? 0) });
      }
      tx.put('slots', { ...slot, reservedOrders: slot.reservedOrders + 1 });

      // 6. Create the order and the simulated payment (FR-07).
      const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      const order: Order = {
        id: this.ctx.crypto.randomId(),
        number: nextOrderNumber(tx),
        customerId,
        status: 'confirmed',
        items,
        slotId: slot.id,
        slotStart: slot.start,
        slotEnd: slot.end,
        customerNote: cart.note.trim(),
        subtotal,
        total: subtotal,
        refundedAmount: 0,
        paymentStatus: 'paid',
        collectionCode: uniqueCollectionCode(tx, this.ctx),
        history: [{ status: 'confirmed', at: nowIso, by: customerId }],
        ingredientReservations: reservations,
        ingredientsConsumed: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      tx.put('orders', order);
      recordPayment(tx, this.ctx, { orderId: order.id, kind: 'charge', amount: subtotal, createdBy: customerId });
      tx.put('carts', { ...cart, items: [], note: '', slotId: undefined, updatedAt: nowIso });

      notifyUser(tx, this.ctx, customerId, {
        kind: 'order_confirmed',
        title: `Order ${order.number} confirmed`,
        body: `Pick up on ${formatDay(slot.start)}, ${formatTime(slot.start)} to ${formatTime(slot.end)}. Show your QR code when you collect.`,
        orderId: order.id,
      });
      notifyRoles(tx, this.ctx, ['owner'], {
        kind: 'new_order',
        title: `New order ${order.number}`,
        body: `${customer.displayName} ordered ${itemsSummary(items)} for ${formatDay(slot.start)}.`,
        orderId: order.id,
      });
      return order;
    });
  }

  /** Kitchen and owner status changes: Preparing, Ready, or Missed. */
  updateStatus(actorId: ID, orderId: ID, to: Exclude<OrderStatus, 'confirmed' | 'cancelled' | 'collected'>) {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'updateProduction');
      const order = tx.require('orders', orderId, 'order');
      return this.applyStatus(tx, order, to, actor);
    });
  }

  /** Moves several orders forward at once (for example "start all" on the board). */
  bulkUpdateStatus(actorId: ID, orderIds: ID[], to: 'preparing' | 'ready') {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'updateProduction');
      let changed = 0;
      for (const id of orderIds) {
        const order = tx.get('orders', id);
        if (!order) continue;
        this.applyStatus(tx, order, to, actor);
        changed += 1;
      }
      return changed;
    });
  }

  /** Owner cancellation (Confirmed only). Releases every reservation and refunds the customer. */
  cancel(actorId: ID, orderId: ID, reason: string) {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'cancelOrders');
      ensure(reason.trim(), 'VALIDATION', 'Give a reason so the customer knows why.');
      const order = tx.require('orders', orderId, 'order');
      const cancelled = this.cancelInTx(tx, order, actor, reason.trim());
      for (const request of tx.all('changeRequests')) {
        if (request.orderId === orderId && request.status === 'pending') {
          tx.put('changeRequests', {
            ...request,
            status: request.type === 'cancel' ? 'approved' : 'rejected',
            resolvedAt: this.ctx.now().toISOString(),
            resolvedBy: actorId,
            responseNote: 'The order was cancelled.',
          });
        }
      }
      return cancelled;
    });
  }

  /** Looks up an order from a scanned QR code or a typed collection code. */
  findByCollectionCode(actorId: ID, raw: string): Order {
    const state = this.ctx.db.getState();
    const actor = state.users[actorId];
    requireCapability(actor, 'verifyCollection');
    const parsed = parseCollectionCode(raw);
    ensure(parsed, 'INVALID_CODE', 'That is not a BatchBite collection code.');
    const order = Object.values(state.orders).find(
      (o) => o.collectionCode === parsed.code && (!parsed.orderId || o.id === parsed.orderId),
    );
    ensure(order, 'INVALID_CODE', 'No order matches that code. Check it and try again.');
    return order;
  }

  /** Confirms pickup after the code was checked. Only Ready (or Missed) orders can be collected. */
  confirmCollection(actorId: ID, orderId: ID, code: string) {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'verifyCollection');
      const order = tx.require('orders', orderId, 'order');
      const parsed = parseCollectionCode(code);
      ensure(parsed && parsed.code === order.collectionCode, 'INVALID_CODE', 'The collection code does not match this order.');
      if (order.status === 'confirmed' || order.status === 'preparing') {
        throw new AppError('INVALID_TRANSITION', `${order.number} is not ready yet, so it cannot be collected.`);
      }
      assertTransition(order.status, 'collected', actor.role);
      const now = this.ctx.now().toISOString();
      const collected = tx.put('orders', {
        ...withStatus(order, 'collected', actorId, now),
        collectedAt: now,
        collectedBy: actorId,
      });
      notifyUser(tx, this.ctx, order.customerId, {
        kind: 'order_collected',
        title: `${order.number} collected`,
        body: 'Thanks for ordering with us. Enjoy!',
        orderId,
      });
      return collected;
    });
  }

  /** Tells customers their order will be late (the "delay" notification). */
  reportDelay(actorId: ID, orderIds: ID[], minutes: number, reason: string) {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'reportDelays');
      ensure(Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60, 'VALIDATION', 'Enter a delay between 1 minute and 24 hours.');
      ensure(reason.trim(), 'VALIDATION', 'Give a short reason for the delay.');
      const now = this.ctx.now().toISOString();
      let count = 0;
      for (const id of orderIds) {
        const order = tx.get('orders', id);
        if (!order || !['confirmed', 'preparing', 'ready'].includes(order.status)) continue;
        tx.put('orders', {
          ...order,
          delay: { minutes, reason: reason.trim(), reportedAt: now, reportedBy: actorId },
          updatedAt: now,
        });
        notifyUser(tx, this.ctx, order.customerId, {
          kind: 'order_delayed',
          title: `${order.number} is running late`,
          body: `Expect it about ${minutes} min later than planned (around ${formatTime(addMinutes(order.slotStart, minutes))}). ${reason.trim()}`,
          orderId: order.id,
        });
        count += 1;
      }
      ensure(count > 0, 'VALIDATION', 'None of these orders can be delayed any more.');
      return count;
    });
  }

  /** Owner refund, full or partial, for any paid order. */
  refund(actorId: ID, orderId: ID, amount: Fils, reason: string) {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'issueRefunds');
      const order = tx.require('orders', orderId, 'order');
      ensure(reason.trim(), 'VALIDATION', 'Give a reason for the refund.');
      const refundable = netPaid(tx, orderId);
      ensure(Number.isInteger(amount) && amount > 0, 'VALIDATION', 'Enter a refund amount above zero.');
      ensure(amount <= refundable, 'VALIDATION', `You can refund at most ${formatMoney(refundable)} for this order.`);
      return this.refundInTx(tx, order, amount, reason.trim(), actorId);
    });
  }

  /** Customer asks to change or cancel a confirmed order. The owner approves or rejects it. */
  requestChange(customerId: ID, orderId: ID, input: ChangeRequestInput): Promise<ChangeRequest> {
    return this.ctx.db.transaction((tx) => {
      const customer = loadActor(tx, customerId);
      requireCapability(customer, 'placeOrders');
      ensure(tx.read('settings').allowChangeRequests, 'FORBIDDEN', 'The bakery is not accepting order changes right now.');
      const order = tx.require('orders', orderId, 'order');
      ensure(order.customerId === customerId, 'FORBIDDEN', 'You can only change your own orders.');
      ensure(order.status === 'confirmed', 'CONFLICT', 'Production has started, so this order can no longer be changed.');
      ensure(
        !tx.all('changeRequests').some((r) => r.orderId === orderId && r.status === 'pending'),
        'CONFLICT',
        'You already have a pending request for this order.',
      );
      ensure(input.reason.trim().length <= 300, 'VALIDATION', 'Reasons can have at most 300 characters.');

      const request: ChangeRequest = {
        id: this.ctx.crypto.randomId(),
        orderId,
        customerId,
        type: input.type,
        reason: input.reason.trim(),
        originalItems: order.items.map((i) => ({ orderItemId: i.id, variantName: i.variantName, quantity: i.quantity })),
        originalSlotStart: order.slotStart,
        status: 'pending',
        createdAt: this.ctx.now().toISOString(),
      };

      if (input.type === 'modify') {
        const proposed = this.validateProposal(tx, order, input);
        Object.assign(request, proposed);
      } else {
        ensure(request.reason, 'VALIDATION', 'Tell the bakery why you want to cancel.');
      }

      tx.put('changeRequests', request);
      notifyRoles(tx, this.ctx, ['owner'], {
        kind: 'change_requested',
        title: `${order.number}: ${input.type === 'cancel' ? 'cancellation' : 'change'} requested`,
        body: `${customer.displayName}: ${request.reason || 'No reason given.'}`,
        orderId,
      });
      return request;
    });
  }

  withdrawRequest(customerId: ID, requestId: ID) {
    return this.ctx.db.transaction((tx) => {
      loadActor(tx, customerId);
      const request = tx.require('changeRequests', requestId, 'request');
      ensure(request.customerId === customerId, 'FORBIDDEN', 'You can only withdraw your own requests.');
      ensure(request.status === 'pending', 'CONFLICT', 'This request has already been answered.');
      tx.put('changeRequests', { ...request, status: 'withdrawn', resolvedAt: this.ctx.now().toISOString() });
    });
  }

  /**
   * Approves or rejects a customer request. Approval re-checks stock, the slot
   * and ingredients, then charges or refunds the price difference.
   */
  resolveRequest(actorId: ID, requestId: ID, approve: boolean, responseNote: string) {
    return this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      requireCapability(actor, 'resolveChangeRequests');
      const request = tx.require('changeRequests', requestId, 'request');
      ensure(request.status === 'pending', 'CONFLICT', 'This request has already been answered.');
      const order = tx.require('orders', request.orderId, 'order');
      const now = this.ctx.now().toISOString();

      if (!approve) {
        tx.put('changeRequests', { ...request, status: 'rejected', resolvedAt: now, resolvedBy: actorId, responseNote: responseNote.trim() });
        notifyUser(tx, this.ctx, order.customerId, {
          kind: 'change_resolved',
          title: `Request for ${order.number} declined`,
          body: responseNote.trim() || 'The bakery could not make this change. Your order stays as it was.',
          orderId: order.id,
        });
        return { request, priceDifference: 0 };
      }

      ensure(order.status === 'confirmed', 'CONFLICT', 'Production has already started, so this request can only be declined.');
      let priceDifference = 0;
      if (request.type === 'cancel') {
        const before = netPaid(tx, order.id);
        this.cancelInTx(tx, order, actor, `Cancelled at the customer's request. ${request.reason}`.trim());
        priceDifference = -before;
      } else {
        priceDifference = this.applyModification(tx, order, request, actorId);
      }

      const resolved = tx.put('changeRequests', {
        ...request,
        status: 'approved',
        resolvedAt: now,
        resolvedBy: actorId,
        responseNote: responseNote.trim(),
        priceDifference,
      });
      if (request.type === 'modify') {
        const money =
          priceDifference > 0
            ? ` ${formatMoney(priceDifference)} was charged to your card.`
            : refundText(-priceDifference);
        notifyUser(tx, this.ctx, order.customerId, {
          kind: 'change_resolved',
          title: `Changes to ${order.number} approved`,
          body: `${responseNote.trim() || 'Your order has been updated.'}${money}`,
          orderId: order.id,
        });
      }
      return { request: resolved, priceDifference };
    });
  }

  /**
   * Background check: a Ready order that was not picked up before its slot
   * ended (plus any delay and the grace period) becomes Missed, and the
   * customer and owners are told. Runs every minute while the app is open.
   */
  runScheduledChecks(): Promise<number> {
    return this.ctx.db.transaction((tx) => {
      const now = this.ctx.now();
      const grace = tx.read('settings').pickupGraceMinutes;
      let missed = 0;
      for (const order of tx.all('orders')) {
        if (order.status !== 'ready') continue;
        const deadline = addMinutes(order.slotEnd, grace + (order.delay?.minutes ?? 0));
        if (now.getTime() <= deadline.getTime()) continue;
        tx.put('orders', withStatus(order, 'missed', 'system', now.toISOString(), 'Not collected during the pickup slot'));
        notifyUser(tx, this.ctx, order.customerId, {
          kind: 'order_missed',
          title: `You missed the pickup for ${order.number}`,
          body: 'Your order is still waiting for you. Contact the bakery to arrange a new collection time.',
          orderId: order.id,
        });
        notifyRoles(tx, this.ctx, ['owner'], {
          kind: 'order_missed',
          title: `${order.number} was not collected`,
          body: `The ${formatTime(order.slotStart)} pickup on ${formatDay(order.slotStart)} was missed.`,
          orderId: order.id,
        });
        missed += 1;
      }
      return missed;
    });
  }

  // -------------------------------------------------------------------------

  private applyStatus(tx: Transaction, order: Order, to: OrderStatus, actor: User): Order {
    assertTransition(order.status, to, actor.role);
    const now = this.ctx.now().toISOString();
    let updated = withStatus(order, to, actor.id, now);
    if (to === 'preparing' && !order.ingredientsConsumed) {
      consumeIngredients(tx, this.ctx, order.ingredientReservations);
      updated = { ...updated, ingredientsConsumed: true };
    }
    tx.put('orders', updated);
    // Production started, so pending change requests can no longer be applied.
    if (to === 'preparing') {
      for (const request of tx.all('changeRequests')) {
        if (request.orderId === order.id && request.status === 'pending') {
          tx.put('changeRequests', {
            ...request,
            status: 'rejected',
            resolvedAt: now,
            resolvedBy: actor.id,
            responseNote: 'Production had already started.',
          });
        }
      }
    }

    const messages: Partial<Record<OrderStatus, { title: string; body: string }>> = {
      preparing: { title: `We're preparing ${order.number}`, body: 'The kitchen has started on your order.' },
      ready: {
        title: `${order.number} is ready for pickup`,
        body: `Collect it on ${formatDay(order.slotStart)} between ${formatTime(order.slotStart)} and ${formatTime(order.slotEnd)}. Show your QR code.`,
      },
      missed: {
        title: `You missed the pickup for ${order.number}`,
        body: 'Your order is still waiting for you. Contact the bakery to arrange a new collection time.',
      },
    };
    const message = messages[to];
    if (message) {
      notifyUser(tx, this.ctx, order.customerId, {
        kind: to === 'preparing' ? 'order_preparing' : to === 'ready' ? 'order_ready' : 'order_missed',
        ...message,
        orderId: order.id,
      });
    }
    return updated;
  }

  private cancelInTx(tx: Transaction, order: Order, actor: User, reason: string): Order {
    assertTransition(order.status, 'cancelled', actor.role);
    releaseOrderHolds(tx, this.ctx, order);
    const now = this.ctx.now().toISOString();
    const cancelled = tx.put('orders', { ...withStatus(order, 'cancelled', actor.id, now, reason), cancelReason: reason });
    const refundable = netPaid(tx, order.id);
    const refunded = refundable > 0 ? this.refundInTx(tx, cancelled, refundable, 'Order cancelled', actor.id, false) : cancelled;
    notifyUser(tx, this.ctx, order.customerId, {
      kind: 'order_cancelled',
      title: `${order.number} was cancelled`,
      body: `${reason}${refundText(refundable)}`,
      orderId: order.id,
    });
    return refunded;
  }

  private refundInTx(tx: Transaction, order: Order, amount: Fils, reason: string, actorId: ID, notify = true): Order {
    recordPayment(tx, this.ctx, { orderId: order.id, kind: 'refund', amount, reason, createdBy: actorId });
    const { charged, refunded } = paymentSummary(tx, order.id);
    const updated = tx.put('orders', {
      ...order,
      refundedAmount: refunded,
      paymentStatus: paymentStatusFor(charged, refunded),
      updatedAt: this.ctx.now().toISOString(),
    });
    if (notify) {
      notifyUser(tx, this.ctx, order.customerId, {
        kind: 'refund_issued',
        title: `Refund for ${order.number}`,
        body: `${formatMoney(amount)} has been refunded to your card. ${reason}`,
        orderId: order.id,
      });
    }
    return updated;
  }

  private validateProposal(tx: Transaction, order: Order, input: ChangeRequestInput) {
    const proposedItems = input.items ?? order.items.map((i) => ({ orderItemId: i.id, variantId: i.variantId, quantity: i.quantity }));
    const totalUnits = proposedItems.reduce((sum, p) => sum + p.quantity, 0);
    ensure(totalUnits > 0, 'VALIDATION', 'Keep at least one item, or request a cancellation instead.');
    for (const proposal of proposedItems) {
      const item = order.items.find((i) => i.id === proposal.orderItemId);
      ensure(item, 'VALIDATION', 'A changed item is not part of this order.');
      ensure(Number.isInteger(proposal.quantity) && proposal.quantity >= 0 && proposal.quantity <= 50, 'VALIDATION', 'Quantities must be between 0 and 50.');
      const version = tx.require('productVersions', item.productVersionId, 'product version');
      ensure(version.variants.some((v) => v.id === proposal.variantId), 'VALIDATION', `That option is not available for ${item.productName}.`);
      if (proposal.quantity > item.quantity) {
        const batch = tx.require('batches', item.batchId, 'batch');
        ensure(isOpen(batch, this.ctx.now()), 'ORDERING_CLOSED', `Ordering for ${item.productName} has closed, so the quantity can only go down.`);
      }
    }
    if (input.slotId && input.slotId !== order.slotId) {
      const slot = tx.require('slots', input.slotId, 'pickup slot');
      ensure(isSameDay(slot.start, order.slotStart), 'VALIDATION', 'Choose a slot on the same collection day.');
      ensure(isSlotAvailable(slot), 'SLOT_FULL', 'That pickup slot is full.');
    }
    const note = input.note?.trim();
    ensure(!note || note.length <= 300, 'VALIDATION', 'Notes can have at most 300 characters.');

    const itemsChanged = proposedItems.some((p) => {
      const item = order.items.find((i) => i.id === p.orderItemId);
      return !item || item.quantity !== p.quantity || item.variantId !== p.variantId;
    });
    const slotChanged = !!input.slotId && input.slotId !== order.slotId;
    const noteChanged = input.note !== undefined && note !== order.customerNote;
    ensure(itemsChanged || slotChanged || noteChanged, 'VALIDATION', 'You have not changed anything yet.');

    return {
      proposedItems: itemsChanged ? proposedItems : undefined,
      proposedSlotId: slotChanged ? input.slotId : undefined,
      proposedNote: noteChanged ? note : undefined,
    };
  }

  /** Applies an approved modification and settles the price difference. */
  private applyModification(tx: Transaction, order: Order, request: ChangeRequest, actorId: ID): Fils {
    const now = this.ctx.now();
    let items = order.items;
    let reservations = order.ingredientReservations;

    if (request.proposedItems) {
      const nextItems: OrderItem[] = [];
      for (const item of order.items) {
        const proposal = request.proposedItems.find((p) => p.orderItemId === item.id);
        const quantity = proposal ? proposal.quantity : item.quantity;
        const variantId = proposal ? proposal.variantId : item.variantId;
        const delta = quantity - item.quantity;
        const batch = tx.require('batches', item.batchId, 'batch');
        if (delta > 0) {
          ensure(isOpen(batch, now), 'ORDERING_CLOSED', `Ordering for ${item.productName} has closed.`);
          ensure(batch.remainingQuantity >= delta, 'SOLD_OUT', `Only ${batch.remainingQuantity} more ${item.productName} available.`);
        }
        tx.put('batches', { ...batch, remainingQuantity: batch.remainingQuantity - delta });
        if (quantity > 0) {
          const version = tx.require('productVersions', item.productVersionId, 'product version');
          const variantName = version.variants.find((v) => v.id === variantId)?.name ?? item.variantName;
          nextItems.push({ ...item, quantity, variantId, variantName });
        }
      }
      ensure(nextItems.length > 0, 'VALIDATION', 'An order needs at least one item.');
      // Swap ingredient holds: release the old ones, then reserve for the new lines.
      releaseIngredients(tx, this.ctx, order.ingredientReservations);
      reservations = reserveIngredients(tx, this.ctx, ingredientNeeds(tx, nextItems), tx.read('settings').enforceIngredientStock);
      items = nextItems;
    }

    let slotFields = {};
    if (request.proposedSlotId) {
      const newSlot = tx.require('slots', request.proposedSlotId, 'pickup slot');
      ensure(isSlotAvailable(newSlot), 'SLOT_FULL', 'The requested pickup slot is now full.');
      const oldSlot = tx.get('slots', order.slotId);
      if (oldSlot) tx.put('slots', { ...oldSlot, reservedOrders: Math.max(0, oldSlot.reservedOrders - 1) });
      tx.put('slots', { ...newSlot, reservedOrders: newSlot.reservedOrders + 1 });
      slotFields = { slotId: newSlot.id, slotStart: newSlot.start, slotEnd: newSlot.end };
    }

    // Prices stay locked at the order's product version.
    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const difference = subtotal - order.subtotal;
    const nowIso = now.toISOString();
    let updated: Order = {
      ...order,
      ...slotFields,
      items,
      ingredientReservations: reservations,
      customerNote: request.proposedNote ?? order.customerNote,
      subtotal,
      total: order.total + difference,
      updatedAt: nowIso,
      history: [...order.history, { status: order.status, at: nowIso, by: actorId, note: 'Order changed at the customer’s request' }],
    };
    tx.put('orders', updated);

    if (difference > 0) {
      recordPayment(tx, this.ctx, { orderId: order.id, kind: 'charge', amount: difference, reason: 'Order change', createdBy: actorId });
    } else if (difference < 0) {
      updated = this.refundInTx(tx, updated, -difference, 'Order change', actorId, false);
    }
    const { charged, refunded } = paymentSummary(tx, order.id);
    tx.put('orders', { ...updated, refundedAmount: refunded, paymentStatus: paymentStatusFor(charged, refunded) });
    return difference;
  }
}

export { STATUS_LABELS };

/** When the customer can expect the order, including any reported delay. */
export function expectedReadyTime(order: Order): Date {
  return addMinutes(order.slotStart, order.delay?.minutes ?? 0);
}

export function isPastSlot(order: Order, now: Date): boolean {
  return now.getTime() > toDate(order.slotEnd).getTime();
}
