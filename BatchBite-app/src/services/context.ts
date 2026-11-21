/**
 * Dependencies shared by every service. Injecting them (instead of importing
 * expo modules directly) keeps the business logic testable in plain Jest.
 */
import type { Database, Transaction } from '@/data/database';
import { AppError } from '@/domain/errors';
import type { ID, User } from '@/domain/types';

export interface CryptoProvider {
  /** Random unique identifier. */
  randomId(): string;
  /** Random string from an unambiguous alphabet (no 0/O, 1/I). */
  randomCode(length: number): string;
  /** Random salt for password hashing. */
  newSalt(): string;
  /** Returns a hex hash of `password` with `salt`. */
  hashPassword(password: string, salt: string): Promise<string>;
}

export interface ServiceContext {
  db: Database;
  crypto: CryptoProvider;
  /** Current time. Overridden in tests to simulate deadlines passing. */
  now(): Date;
}

/** Loads the acting user inside a transaction so permission checks use fresh data. */
export function loadActor(tx: Transaction, actorId: ID): User {
  const actor = tx.get('users', actorId);
  if (!actor) throw new AppError('FORBIDDEN', 'Please log in again.');
  if (!actor.active) throw new AppError('FORBIDDEN', 'This account has been deactivated.');
  return actor;
}

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
