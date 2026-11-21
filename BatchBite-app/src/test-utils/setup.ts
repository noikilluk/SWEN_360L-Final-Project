/**
 * Test helpers: a Node crypto provider with the same algorithm as the app,
 * and a factory for services on an in-memory database with a controllable clock.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Database } from '@/data/database';
import { buildDemoState } from '@/data/seed';
import { MemoryStorage } from '@/data/storage';
import { HASH_ROUNDS_FOR_TESTS } from '@/test-utils/constants';
import { createServices } from '@/services';
import { CODE_ALPHABET, type CryptoProvider } from '@/services/context';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export const nodeCrypto: CryptoProvider = {
  randomId: () => randomUUID(),
  randomCode: (length) => {
    let code = '';
    for (const byte of randomBytes(length)) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    return code;
  },
  newSalt: () => randomBytes(16).toString('hex'),
  hashPassword: async (password, salt) => {
    let hash = sha256(`${salt}:${password}`);
    for (let round = 1; round < HASH_ROUNDS_FOR_TESTS; round++) hash = sha256(`${hash}:${salt}`);
    return hash;
  },
};

export class TestClock {
  constructor(public current: Date) {}
  now = () => new Date(this.current);
  advanceMinutes(minutes: number) {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
  set(date: Date) {
    this.current = new Date(date);
  }
}

/** Fixed "now" for tests: Monday 19 October 2026, 10:00 local time. */
export const TEST_NOW = new Date(2026, 9, 19, 10, 0, 0);

export async function createTestApp(options: { seed?: boolean; storage?: MemoryStorage } = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const { db } = await Database.open(storage);
  const clock = new TestClock(TEST_NOW);
  const services = createServices({ db, crypto: nodeCrypto, now: clock.now });
  if (options.seed !== false) {
    await db.replaceAll(await buildDemoState(nodeCrypto, TEST_NOW));
  }
  const userId = (username: string) => {
    const user = Object.values(db.getState().users).find((u) => u.username === username);
    if (!user) throw new Error(`No user ${username}`);
    return user.id;
  };
  return { db, storage, clock, services, userId };
}
