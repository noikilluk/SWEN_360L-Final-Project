/**
 * Batch rules (UML `Batch.isOpen()`, FR-04, FR-05) and the labels customers see.
 */
import { HOUR, isSameDay, toDate } from './time';
import type { Batch, PickupSlot, Settings } from './types';

/** Ordering is open while the batch is published and the deadline has not passed (FR-05). */
export function isOpen(batch: Batch, now: Date): boolean {
  return batch.status === 'published' && now.getTime() < toDate(batch.orderDeadline).getTime();
}

export function isSoldOut(batch: Batch): boolean {
  return batch.remainingQuantity <= 0;
}

/** True when a customer can add this batch to the cart right now. */
export function canOrder(batch: Batch, now: Date): boolean {
  return isOpen(batch, now) && !isSoldOut(batch);
}

export function soldQuantity(batch: Batch): number {
  return batch.maxQuantity - batch.remainingQuantity;
}

/** Share of the batch still available, from 0 to 1 (drives the progress bar). */
export function remainingRatio(batch: Batch): number {
  if (batch.maxQuantity <= 0) return 0;
  return Math.min(1, Math.max(0, batch.remainingQuantity / batch.maxQuantity));
}

export function isClosingSoon(batch: Batch, now: Date, settings: Pick<Settings, 'closingSoonHours'>): boolean {
  if (!canOrder(batch, now)) return false;
  const msLeft = toDate(batch.orderDeadline).getTime() - now.getTime();
  return msLeft <= settings.closingSoonHours * HOUR;
}

export function isPickupToday(batch: Batch, now: Date): boolean {
  return isSameDay(batch.collectionStart, now);
}

export type BatchBadge = 'sold_out' | 'closed' | 'closing_soon' | 'pickup_today';

/** Badges shown on batch cards, most important first. */
export function batchBadges(batch: Batch, now: Date, settings: Pick<Settings, 'closingSoonHours'>): BatchBadge[] {
  const badges: BatchBadge[] = [];
  if (isSoldOut(batch)) badges.push('sold_out');
  else if (!isOpen(batch, now)) badges.push('closed');
  else if (isClosingSoon(batch, now, settings)) badges.push('closing_soon');
  if (isPickupToday(batch, now) && batch.status === 'published') badges.push('pickup_today');
  return badges;
}

/** A batch stays visible to customers until the day after its collection date. */
export function isVisibleToCustomers(batch: Batch, now: Date): boolean {
  if (batch.status !== 'published') return false;
  const collection = toDate(batch.collectionStart);
  const endOfCollectionDay = new Date(collection);
  endOfCollectionDay.setHours(23, 59, 59, 999);
  return now.getTime() <= endOfCollectionDay.getTime();
}

/** Next published batch of the same product that collects after `batch` (for sold-out cards). */
export function findNextBatch(batch: Batch, allBatches: Iterable<Batch>, now: Date): Batch | undefined {
  let best: Batch | undefined;
  for (const candidate of allBatches) {
    if (candidate.id === batch.id || candidate.productId !== batch.productId) continue;
    if (candidate.status !== 'published' || !canOrder(candidate, now)) continue;
    if (toDate(candidate.collectionStart) <= toDate(batch.collectionStart)) continue;
    if (!best || toDate(candidate.collectionStart) < toDate(best.collectionStart)) best = candidate;
  }
  return best;
}

export function isSlotAvailable(slot: PickupSlot): boolean {
  return slot.reservedOrders < slot.maxOrders;
}

export function slotPlacesLeft(slot: PickupSlot): number {
  return Math.max(0, slot.maxOrders - slot.reservedOrders);
}

/**
 * Slots a customer may choose for a cart whose items collect on the given
 * day: same calendar day, starting at or after the latest collection start, and
 * not yet ended.
 */
export function eligibleSlots(
  slots: Iterable<PickupSlot>,
  collectionStarts: readonly string[],
  now: Date,
): PickupSlot[] {
  if (collectionStarts.length === 0) return [];
  const latestStart = Math.max(...collectionStarts.map((s) => toDate(s).getTime()));
  const day = collectionStarts[0];
  const result: PickupSlot[] = [];
  for (const slot of slots) {
    if (!isSameDay(slot.start, day)) continue;
    if (toDate(slot.start).getTime() < latestStart) continue;
    if (toDate(slot.end).getTime() <= now.getTime()) continue;
    result.push(slot);
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}
