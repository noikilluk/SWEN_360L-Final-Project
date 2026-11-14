/**
 * Shopping cart (US-03). The cart is saved per customer, so it survives
 * closing the app. Stock is only reserved at checkout; the checks here give
 * early, friendly feedback.
 */
import type { Transaction } from '@/data/database';
import { AppError, ensure } from '@/domain/errors';
import { canOrder, isOpen, isSoldOut } from '@/domain/batch';
import { requireCapability } from '@/domain/permissions';
import { formatDay, isSameDay } from '@/domain/time';
import type { Cart, ID } from '@/domain/types';

import { type ServiceContext, loadActor } from './context';

export const MAX_UNITS_PER_LINE = 50;

export class CartService {
  constructor(private readonly ctx: ServiceContext) {}

  /**
   * Adds units of a batch and option to the cart. Throws CART_DATE_CONFLICT when
   * the cart already holds items for another collection day, unless
   * `replaceCart` is set, in which case the old items are removed first.
   */
  addItem(customerId: ID, batchId: ID, variantId: ID, quantity: number, options: { replaceCart?: boolean } = {}) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, customerId), 'placeOrders');
      ensure(Number.isInteger(quantity) && quantity > 0, 'VALIDATION', 'Choose a quantity of at least 1.');
      const batch = tx.require('batches', batchId, 'batch');
      const product = tx.require('products', batch.productId, 'product');
      ensure(product.variants.some((v) => v.id === variantId), 'VALIDATION', 'Choose one of the available options.');
      ensure(!isSoldOut(batch), 'SOLD_OUT', `${product.name} is sold out.`);
      ensure(isOpen(batch, this.ctx.now()), 'ORDERING_CLOSED', `Ordering for ${product.name} has closed.`);

      let cart = getOrCreateCart(tx, customerId, this.ctx.now().toISOString());
      const otherDay = cart.items
        .map((item) => tx.get('batches', item.batchId))
        .find((b) => b && !isSameDay(b.collectionStart, batch.collectionStart));
      if (otherDay) {
        if (!options.replaceCart) {
          throw new AppError(
            'CART_DATE_CONFLICT',
            `Your cart has items for collection on ${formatDay(otherDay.collectionStart)}. One order can only be collected on one day.`,
          );
        }
        cart = { ...cart, items: [], slotId: undefined };
      }

      const inCart = cart.items.filter((i) => i.batchId === batchId).reduce((sum, i) => sum + i.quantity, 0);
      ensure(
        inCart + quantity <= batch.remainingQuantity,
        'SOLD_OUT',
        `Only ${batch.remainingQuantity} ${product.name} left${inCart ? ` and ${inCart} are already in your cart` : ''}.`,
      );

      const existing = cart.items.find((i) => i.batchId === batchId && i.variantId === variantId);
      const items = existing
        ? cart.items.map((i) =>
            i.id === existing.id ? { ...i, quantity: Math.min(MAX_UNITS_PER_LINE, i.quantity + quantity) } : i,
          )
        : [
            ...cart.items,
            {
              id: this.ctx.crypto.randomId(),
              batchId,
              variantId,
              quantity: Math.min(MAX_UNITS_PER_LINE, quantity),
              addedAt: this.ctx.now().toISOString(),
            },
          ];
      return tx.put('carts', { ...cart, items, updatedAt: this.ctx.now().toISOString() });
    });
  }

  updateQuantity(customerId: ID, itemId: ID, quantity: number) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, customerId), 'placeOrders');
      const cart = getOrCreateCart(tx, customerId, this.ctx.now().toISOString());
      const item = cart.items.find((i) => i.id === itemId);
      ensure(item, 'NOT_FOUND', 'That item is no longer in your cart.');
      if (quantity <= 0) {
        return tx.put('carts', touch({ ...cart, items: cart.items.filter((i) => i.id !== itemId) }, this.ctx));
      }
      const batch = tx.get('batches', item.batchId);
      const otherUnits = cart.items
        .filter((i) => i.batchId === item.batchId && i.id !== itemId)
        .reduce((sum, i) => sum + i.quantity, 0);
      if (batch) {
        ensure(
          quantity + otherUnits <= batch.remainingQuantity,
          'SOLD_OUT',
          `Only ${batch.remainingQuantity} left in this batch.`,
        );
      }
      ensure(quantity <= MAX_UNITS_PER_LINE, 'VALIDATION', `You can order up to ${MAX_UNITS_PER_LINE} at a time.`);
      return tx.put(
        'carts',
        touch({ ...cart, items: cart.items.map((i) => (i.id === itemId ? { ...i, quantity } : i)) }, this.ctx),
      );
    });
  }

  removeItem(customerId: ID, itemId: ID) {
    return this.updateQuantity(customerId, itemId, 0);
  }

  setNote(customerId: ID, note: string) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, customerId), 'placeOrders');
      ensure(note.length <= 300, 'VALIDATION', 'Notes can have at most 300 characters.');
      const cart = getOrCreateCart(tx, customerId, this.ctx.now().toISOString());
      return tx.put('carts', touch({ ...cart, note }, this.ctx));
    });
  }

  selectSlot(customerId: ID, slotId: ID | undefined) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, customerId), 'placeOrders');
      const cart = getOrCreateCart(tx, customerId, this.ctx.now().toISOString());
      return tx.put('carts', touch({ ...cart, slotId }, this.ctx));
    });
  }

  /** Removes items whose batch closed, sold out or was deleted. Returns how many were removed. */
  removeUnavailable(customerId: ID) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, customerId), 'placeOrders');
      const cart = tx.get('carts', customerId);
      if (!cart) return 0;
      const now = this.ctx.now();
      const items = cart.items.filter((item) => {
        const batch = tx.get('batches', item.batchId);
        const product = batch && tx.get('products', batch.productId);
        return batch && product && canOrder(batch, now) && product.variants.some((v) => v.id === item.variantId);
      });
      const removed = cart.items.length - items.length;
      if (removed) tx.put('carts', touch({ ...cart, items }, this.ctx));
      return removed;
    });
  }
}

export function getOrCreateCart(tx: Transaction, customerId: ID, now: string): Cart {
  return tx.get('carts', customerId) ?? { id: customerId, items: [], note: '', updatedAt: now };
}

function touch(cart: Cart, ctx: ServiceContext): Cart {
  return { ...cart, updatedAt: ctx.now().toISOString() };
}
