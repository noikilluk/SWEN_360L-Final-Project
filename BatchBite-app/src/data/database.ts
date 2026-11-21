/**
 * Local database: an in-memory copy of all tables, saved to persistent storage
 * after every successful transaction.
 *
 * Guarantees
 * - Serial: transactions run one at a time through a queue, so two checkouts
 *   started at the same moment can never both reserve the last unit (NFR-01).
 * - Atomic: a transaction's writes are collected in a draft. If the transaction
 *   throws, or saving to storage fails, the draft is thrown away and neither
 *   memory nor storage change.
 * - Efficient: only tables that changed are rewritten, and unchanged tables
 *   keep their object identity so React can skip work.
 * - Recoverable: a table that cannot be parsed on load is copied to a
 *   `corrupt` key for inspection and replaced with an empty table, instead of
 *   crashing the app.
 */
import { AppError } from '@/domain/errors';
import type { ID } from '@/domain/types';

import {
  DB_KEYS,
  type DbKey,
  type DbState,
  type EntityOf,
  emptyState,
  migrate,
  type TableName,
} from './schema';
import type { StorageAdapter } from './storage';

const KEY_PREFIX = 'batchbite:v1:';

export function storageKey(key: DbKey): string {
  return `${KEY_PREFIX}${key}`;
}

export class Transaction {
  private readonly draft = new Map<DbKey, unknown>();

  constructor(private readonly base: DbState) {}

  /** Current value of a table or document, including this transaction's writes. */
  read<K extends DbKey>(key: K): DbState[K] {
    return (this.draft.has(key) ? this.draft.get(key) : this.base[key]) as DbState[K];
  }

  get<T extends TableName>(table: T, id: ID | undefined): EntityOf<T> | undefined {
    if (!id) return undefined;
    return (this.read(table) as Record<ID, EntityOf<T>>)[id];
  }

  /** Like `get`, but throws a NOT_FOUND error with a friendly message. */
  require<T extends TableName>(table: T, id: ID | undefined, label: string): EntityOf<T> {
    const entity = this.get(table, id);
    if (!entity) throw new AppError('NOT_FOUND', `That ${label} no longer exists.`);
    return entity;
  }

  all<T extends TableName>(table: T): EntityOf<T>[] {
    return Object.values(this.read(table) as Record<ID, EntityOf<T>>);
  }

  put<T extends TableName>(table: T, entity: EntityOf<T>): EntityOf<T> {
    const records = this.writable(table) as Record<ID, EntityOf<T>>;
    records[(entity as { id: ID }).id] = entity;
    return entity;
  }

  /** Shallow-merges `changes` into an existing entity and saves it. */
  update<T extends TableName>(table: T, id: ID, changes: Partial<EntityOf<T>>): EntityOf<T> {
    const current = this.require(table, id, 'record');
    return this.put(table, { ...current, ...changes } as EntityOf<T>);
  }

  delete(table: TableName, id: ID): void {
    const records = this.writable(table) as Record<ID, unknown>;
    delete records[id];
  }

  setDocument<K extends 'settings' | 'meta'>(key: K, value: DbState[K]): void {
    this.draft.set(key, value);
  }

  /** Replaces a whole table (used by seeding and reset). */
  replaceTable<T extends TableName>(table: T, records: DbState[T]): void {
    this.draft.set(table, records);
  }

  /** Replaces any table or document wholesale (used by recovery and reset). */
  replaceKey(key: DbKey, value: unknown): void {
    this.draft.set(key, value);
  }

  changedKeys(): DbKey[] {
    return [...this.draft.keys()];
  }

  /** @internal */
  applyTo(state: DbState): DbState {
    if (this.draft.size === 0) return state;
    const next = { ...state } as Record<DbKey, unknown>;
    for (const [key, value] of this.draft) next[key] = value;
    return next as unknown as DbState;
  }

  private writable(table: TableName): Record<ID, unknown> {
    if (!this.draft.has(table)) {
      // Copy on first write so the committed state is never mutated.
      this.draft.set(table, { ...(this.base[table] as Record<ID, unknown>) });
    }
    return this.draft.get(table) as Record<ID, unknown>;
  }
}

export interface OpenResult {
  db: Database;
  /** Tables that could not be read and were reset. Empty in normal use. */
  recoveredKeys: DbKey[];
}

export class Database {
  private state: DbState;
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    /** `null` keeps data in memory only (used to build demo data quickly). */
    private readonly storage: StorageAdapter | null,
    initial: DbState,
  ) {
    this.state = initial;
  }

  /** A database that is never saved. */
  static inMemory(initial: DbState = emptyState()): Database {
    return new Database(null, initial);
  }

  /** Loads every table from storage, repairing anything that cannot be read. */
  static async open(storage: StorageAdapter): Promise<OpenResult> {
    const defaults = emptyState();
    const loaded = { ...defaults } as Record<DbKey, unknown>;
    const recoveredKeys: DbKey[] = [];

    const pairs = await storage.multiGet(DB_KEYS.map(storageKey));
    for (let i = 0; i < DB_KEYS.length; i++) {
      const key = DB_KEYS[i];
      const raw = pairs[i]?.[1];
      if (raw == null) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Expected an object');
        }
        loaded[key] = parsed;
      } catch {
        recoveredKeys.push(key);
        // Keep the unreadable value for inspection instead of silently deleting it.
        await storage.setItem(`batchbite:corrupt:${key}:${Date.now()}`, raw).catch(() => undefined);
      }
    }

    const state = migrate(loaded as unknown as DbState);
    const db = new Database(storage, state);
    if (recoveredKeys.length) {
      // Persist the repaired tables so the problem does not repeat on next launch.
      await db.transaction((tx) => {
        for (const key of recoveredKeys) {
          tx.replaceKey(key, state[key]);
        }
      });
    }
    return { db, recoveredKeys };
  }

  getState = (): DbState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Runs `work` with exclusive access to the data. Writes become visible (and
   * are saved) only if `work` completes without throwing.
   */
  transaction<T>(work: (tx: Transaction) => T | Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const tx = new Transaction(this.state);
      const result = await work(tx);
      const changed = tx.changedKeys();
      if (changed.length === 0) return result;

      const next = tx.applyTo(this.state);
      try {
        if (this.storage) {
          await this.storage.multiSet(changed.map((key) => [storageKey(key), JSON.stringify(next[key])] as const));
        }
      } catch (error) {
        throw new AppError(
          'STORAGE',
          `Your changes could not be saved on this device. Nothing was changed. (${(error as Error).message})`,
        );
      }
      this.state = next;
      this.emit();
      return result;
    };

    const result = this.queue.then(run, run);
    // Keep the queue alive even when a transaction fails.
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Replaces every table with `state` in one atomic write (used by seeding and reset). */
  async replaceAll(state: DbState): Promise<void> {
    await this.transaction((tx) => {
      for (const key of DB_KEYS) tx.replaceKey(key, state[key]);
    });
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
