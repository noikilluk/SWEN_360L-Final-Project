import { Database, storageKey } from '@/data/database';
import { MemoryStorage } from '@/data/storage';
import type { User } from '@/domain/types';

const user = (id: string): User => ({
  id,
  username: id,
  displayName: id,
  passwordHash: 'x',
  salt: 'y',
  role: 'customer',
  active: true,
  mustChangePassword: false,
  createdAt: '2026-10-19T07:00:00.000Z',
});

describe('local database (data persistence and integrity)', () => {
  it('saves changes and loads them again in a new session', async () => {
    const storage = new MemoryStorage();
    const { db } = await Database.open(storage);
    await db.transaction((tx) => tx.put('users', user('u1')));
    const reopened = await Database.open(storage);
    expect(reopened.db.getState().users.u1).toMatchObject({ username: 'u1' });
  });

  it('only rewrites the tables that changed', async () => {
    const storage = new MemoryStorage();
    const { db } = await Database.open(storage);
    const spy = jest.spyOn(storage, 'multiSet');
    await db.transaction((tx) => tx.put('users', user('u1')));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].map(([key]) => key)).toEqual([storageKey('users')]);
  });

  it('rolls back everything when a transaction throws', async () => {
    const storage = new MemoryStorage();
    const { db } = await Database.open(storage);
    const before = db.getState();
    await expect(
      db.transaction((tx) => {
        tx.put('users', user('u1'));
        throw new Error('validation failed');
      }),
    ).rejects.toThrow('validation failed');
    expect(db.getState()).toBe(before);
    expect(storage.data.has(storageKey('users'))).toBe(false);
  });

  it('keeps memory unchanged when saving to the device fails', async () => {
    const storage = new MemoryStorage();
    const { db } = await Database.open(storage);
    storage.failNextWrite = true;
    await expect(db.transaction((tx) => tx.put('users', user('u1')))).rejects.toMatchObject({ code: 'STORAGE' });
    expect(db.getState().users.u1).toBeUndefined();
    // The queue keeps working after a failure.
    await db.transaction((tx) => tx.put('users', user('u2')));
    expect(db.getState().users.u2).toBeDefined();
  });

  it('recovers from a corrupted table instead of crashing, keeping a copy', async () => {
    const storage = new MemoryStorage();
    storage.data.set(storageKey('orders'), '{not json');
    storage.data.set(storageKey('users'), JSON.stringify({ u1: user('u1') }));
    const { db, recoveredKeys } = await Database.open(storage);
    expect(recoveredKeys).toEqual(['orders']);
    expect(db.getState().orders).toEqual({});
    expect(db.getState().users.u1).toBeDefined();
    expect([...storage.data.keys()].some((key) => key.startsWith('batchbite:corrupt:orders:'))).toBe(true);
  });

  it('runs transactions one at a time', async () => {
    const { db } = await Database.open(new MemoryStorage());
    const order: string[] = [];
    await Promise.all([
      db.transaction(async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 20));
        order.push('a-end');
      }),
      db.transaction(() => {
        order.push('b');
      }),
    ]);
    expect(order).toEqual(['a-start', 'a-end', 'b']);
  });
});
