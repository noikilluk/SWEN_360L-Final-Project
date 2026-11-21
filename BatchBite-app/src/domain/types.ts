/**
 * Core data model for BatchBite.
 *
 * These types mirror the UML class diagram in the design document
 * (User, Product, ProductVariant, Batch, PickupSlot, Cart, CartItem, Order,
 * OrderItem) and add the Sprint 2 classes that were out of scope in Sprint 1
 * (ProductVersion, Ingredient, Payment, ChangeRequest, ProductionTask,
 * AppNotification).
 *
 * Conventions:
 * - Every entity has a string `id`.
 * - Timestamps are ISO-8601 strings in UTC; they are shown in the device's local time.
 * - Money is stored as integer fils (1 BD = 1000 fils) so totals never suffer
 *   from floating point rounding.
 * - Entities are treated as immutable. Services create updated copies instead of
 *   mutating objects in place, which keeps the store's change detection simple.
 */

export type ID = string;
/** ISO-8601 timestamp, for example `2026-10-20T15:00:00.000Z`. */
export type Timestamp = string;
/** Amount of money in fils (1 BD = 1000 fils). */
export type Fils = number;

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const USER_ROLES = ['customer', 'owner', 'kitchen', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Customer',
  owner: 'Business Owner',
  kitchen: 'Kitchen Staff',
  admin: 'Administrator',
};

export interface User {
  id: ID;
  /** Unique, stored in lower case. */
  username: string;
  displayName: string;
  /** Salted, iterated SHA-256 hash. The plain password is never stored. */
  passwordHash: string;
  salt: string;
  role: UserRole;
  active: boolean;
  /** Set when an administrator issues a temporary password. */
  mustChangePassword: boolean;
  createdAt: Timestamp;
}

export interface PasswordResetRequest {
  id: ID;
  userId: ID;
  username: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: ID;
}

// ---------------------------------------------------------------------------
// Catalogue, recipes and ingredients
// ---------------------------------------------------------------------------

export type IngredientUnit = 'g' | 'ml' | 'pcs';

export interface Ingredient {
  id: ID;
  name: string;
  unit: IngredientUnit;
  /** Physical stock on hand. */
  stock: number;
  /** Stock promised to confirmed orders that have not started production. */
  reserved: number;
  /** Below this available amount the owner is warned. */
  lowStockThreshold: number;
  /** Cost of one unit (1 g, 1 ml or 1 piece) in fils. May be fractional. */
  costPerUnit: number;
  allergens: string[];
  updatedAt: Timestamp;
}

/** Amount of one ingredient needed to make ONE unit of a product. */
export interface RecipeLine {
  ingredientId: ID;
  quantity: number;
}

export interface ProductVariant {
  id: ID;
  name: string;
}

export interface Product {
  id: ID;
  ownerId: ID;
  name: string;
  description: string;
  price: Fils;
  /** Emoji used as a placeholder when there is no photo. */
  emoji: string;
  /** Data URI of an uploaded photo, if any. */
  photoUri?: string;
  variants: ProductVariant[];
  /** Base recipe for one unit, shared by every variant. */
  recipe: RecipeLine[];
  /** Extra ingredients per variant id, added on top of the base recipe. */
  variantRecipes: Record<ID, RecipeLine[]>;
  /** Current version number. Increases whenever the price, recipe or variants change. */
  version: number;
  currentVersionId: ID;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Immutable snapshot of a product's price and recipe. Orders point to the
 * version that was current when they were placed, so later edits never change
 * what a customer paid or what the kitchen has to make for that order.
 */
export interface ProductVersion {
  id: ID;
  productId: ID;
  version: number;
  name: string;
  price: Fils;
  variants: ProductVariant[];
  recipe: RecipeLine[];
  variantRecipes: Record<ID, RecipeLine[]>;
  changeNote: string;
  createdAt: Timestamp;
  createdBy: ID;
}

// ---------------------------------------------------------------------------
// Batches and pickup slots
// ---------------------------------------------------------------------------

export const BATCH_STATUSES = ['draft', 'published', 'completed'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export interface Batch {
  id: ID;
  productId: ID;
  maxQuantity: number;
  remainingQuantity: number;
  /** Ordering closes automatically at this time (FR-05). */
  orderDeadline: Timestamp;
  /** Start of the collection window. Pickup slots on this day start at or after it. */
  collectionStart: Timestamp;
  status: BatchStatus;
  createdAt: Timestamp;
  createdBy: ID;
  publishedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface PickupSlot {
  id: ID;
  start: Timestamp;
  end: Timestamp;
  maxOrders: number;
  reservedOrders: number;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartItem {
  id: ID;
  batchId: ID;
  variantId: ID;
  quantity: number;
  addedAt: Timestamp;
}

/** One cart per customer, keyed by the customer's user id. */
export interface Cart {
  id: ID;
  items: CartItem[];
  note: string;
  slotId?: ID;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Orders, payments and change requests
// ---------------------------------------------------------------------------

export const ORDER_STATUSES = [
  'confirmed',
  'preparing',
  'ready',
  'collected',
  'missed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  id: ID;
  batchId: ID;
  productId: ID;
  /** Version of the product (price and recipe) locked in at checkout. */
  productVersionId: ID;
  productVersion: number;
  productName: string;
  variantId: ID;
  variantName: string;
  quantity: number;
  unitPrice: Fils;
}

export interface StatusChange {
  status: OrderStatus;
  at: Timestamp;
  /** User id, or `system` for automatic changes such as missed collections. */
  by: ID | 'system';
  note?: string;
}

export interface IngredientReservation {
  ingredientId: ID;
  quantity: number;
}

export type PaymentStatus = 'paid' | 'partially_refunded' | 'refunded';

export interface OrderDelay {
  minutes: number;
  reason: string;
  reportedAt: Timestamp;
  reportedBy: ID;
}

export interface Order {
  id: ID;
  /** Short, human friendly reference such as `BB-1042`. */
  number: string;
  customerId: ID;
  status: OrderStatus;
  items: OrderItem[];
  slotId: ID;
  slotStart: Timestamp;
  slotEnd: Timestamp;
  customerNote: string;
  subtotal: Fils;
  total: Fils;
  refundedAmount: Fils;
  paymentStatus: PaymentStatus;
  /** Code encoded in the collection QR code. */
  collectionCode: string;
  history: StatusChange[];
  /** Ingredient stock held for this order until production starts. */
  ingredientReservations: IngredientReservation[];
  ingredientsConsumed: boolean;
  delay?: OrderDelay;
  cancelReason?: string;
  collectedAt?: Timestamp;
  collectedBy?: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Payment {
  id: ID;
  orderId: ID;
  kind: 'charge' | 'refund';
  amount: Fils;
  method: 'simulated_card';
  cardLast4: string;
  reference: string;
  reason?: string;
  createdAt: Timestamp;
  createdBy: ID | 'system';
}

export type ChangeRequestType = 'modify' | 'cancel';
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface ProposedItemChange {
  orderItemId: ID;
  variantId: ID;
  /** 0 removes the line. */
  quantity: number;
}

export interface ChangeRequest {
  id: ID;
  orderId: ID;
  customerId: ID;
  type: ChangeRequestType;
  reason: string;
  /** The order lines as they were when the request was made (for showing before → after). */
  originalItems?: { orderItemId: ID; variantName: string; quantity: number }[];
  originalSlotStart?: Timestamp;
  proposedItems?: ProposedItemChange[];
  proposedSlotId?: ID;
  proposedNote?: string;
  status: ChangeRequestStatus;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: ID;
  responseNote?: string;
  /** Positive: customer paid more. Negative: customer was refunded. */
  priceDifference?: Fils;
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface ProductionTask {
  id: ID;
  batchId?: ID;
  title: string;
  details: string;
  assigneeId?: ID;
  status: TaskStatus;
  dueAt?: Timestamp;
  createdAt: Timestamp;
  createdBy: ID;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// Notifications and settings
// ---------------------------------------------------------------------------

export type NotificationKind =
  | 'order_confirmed'
  | 'new_order'
  | 'order_preparing'
  | 'order_ready'
  | 'order_delayed'
  | 'order_missed'
  | 'order_collected'
  | 'order_cancelled'
  | 'refund_issued'
  | 'change_requested'
  | 'change_resolved'
  | 'task_assigned'
  | 'low_stock'
  | 'password_reset_requested';

export interface AppNotification {
  id: ID;
  userId: ID;
  kind: NotificationKind;
  title: string;
  body: string;
  orderId?: ID;
  batchId?: ID;
  read: boolean;
  createdAt: Timestamp;
}

export interface Settings {
  businessName: string;
  /** A batch is shown as "Closing soon" when its deadline is within this many hours. */
  closingSoonHours: number;
  /** Minutes after a pickup slot ends before a ready order is marked as missed. */
  pickupGraceMinutes: number;
  defaultSlotMinutes: number;
  defaultSlotCapacity: number;
  defaultSlotsPerBatch: number;
  /** Reject checkouts when ingredient stock cannot cover the order. */
  enforceIngredientStock: boolean;
  /** Let customers request changes or cancellations of confirmed orders. */
  allowChangeRequests: boolean;
  /** Show the demo account shortcuts on the log in screen. */
  showDemoAccounts: boolean;
  /** Last four digits shown for the simulated payment card. */
  simulatedCardLast4: string;
}
