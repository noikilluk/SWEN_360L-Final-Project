/**
 * Shape of everything the app stores. Each top-level key is saved under its own
 * storage key, so a change to one table only rewrites that table.
 */
import type {
  AppNotification,
  Batch,
  Cart,
  ChangeRequest,
  ID,
  Ingredient,
  Order,
  PasswordResetRequest,
  Payment,
  PickupSlot,
  Product,
  ProductionTask,
  ProductVersion,
  Settings,
  User,
} from '@/domain/types';

export interface Tables {
  users: Record<ID, User>;
  resetRequests: Record<ID, PasswordResetRequest>;
  products: Record<ID, Product>;
  productVersions: Record<ID, ProductVersion>;
  ingredients: Record<ID, Ingredient>;
  batches: Record<ID, Batch>;
  slots: Record<ID, PickupSlot>;
  /** Keyed by the customer's user id. */
  carts: Record<ID, Cart>;
  orders: Record<ID, Order>;
  payments: Record<ID, Payment>;
  changeRequests: Record<ID, ChangeRequest>;
  tasks: Record<ID, ProductionTask>;
  notifications: Record<ID, AppNotification>;
}

export type TableName = keyof Tables;
export type EntityOf<T extends TableName> = Tables[T][ID];

export interface Meta {
  schemaVersion: number;
  /** Last order number handed out, used to build `BB-1042` style references. */
  orderSequence: number;
  seededAt?: string;
}

export interface DbState extends Tables {
  settings: Settings;
  meta: Meta;
}

export type DbKey = keyof DbState;

export const TABLE_NAMES: readonly TableName[] = [
  'users',
  'resetRequests',
  'products',
  'productVersions',
  'ingredients',
  'batches',
  'slots',
  'carts',
  'orders',
  'payments',
  'changeRequests',
  'tasks',
  'notifications',
];

export const DB_KEYS: readonly DbKey[] = [...TABLE_NAMES, 'settings', 'meta'];

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'BatchBite Bakery',
  closingSoonHours: 24,
  pickupGraceMinutes: 30,
  defaultSlotMinutes: 30,
  defaultSlotCapacity: 5,
  defaultSlotsPerBatch: 4,
  enforceIngredientStock: true,
  allowChangeRequests: true,
  showDemoAccounts: true,
  simulatedCardLast4: '1337',
};

export function emptyState(): DbState {
  return {
    users: {},
    resetRequests: {},
    products: {},
    productVersions: {},
    ingredients: {},
    batches: {},
    slots: {},
    carts: {},
    orders: {},
    payments: {},
    changeRequests: {},
    tasks: {},
    notifications: {},
    settings: { ...DEFAULT_SETTINGS },
    meta: { schemaVersion: SCHEMA_VERSION, orderSequence: 1000 },
  };
}

/**
 * Brings data saved by an older version of the app up to date. There is only
 * one schema version so far; future versions add a step here instead of
 * discarding users' data.
 */
export function migrate(state: DbState): DbState {
  let current = state;
  if (current.meta.schemaVersion < SCHEMA_VERSION) {
    current = { ...current, meta: { ...current.meta, schemaVersion: SCHEMA_VERSION } };
  }
  // New settings added in later releases get their default values.
  current = { ...current, settings: { ...DEFAULT_SETTINGS, ...current.settings } };
  return current;
}
