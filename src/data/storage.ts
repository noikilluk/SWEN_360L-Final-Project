/**
 * Minimal key-value storage contract. The app uses AsyncStorage
 * (see `async-storage-adapter.ts`); tests use the in-memory version below.
 */
export interface StorageAdapter {
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  /** Must write all pairs or none (AsyncStorage's multiSet is atomic on native). */
  multiSet(pairs: readonly (readonly [string, string])[]): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

/** In-memory storage used by unit tests and as a fallback. */
export class MemoryStorage implements StorageAdapter {
  readonly data = new Map<string, string>();
  /** When set, the next write throws (used to test failure handling). */
  failNextWrite = false;

  async multiGet(keys: readonly string[]) {
    return keys.map((key) => [key, this.data.get(key) ?? null] as const);
  }

  async multiSet(pairs: readonly (readonly [string, string])[]) {
    this.checkFailure();
    for (const [key, value] of pairs) this.data.set(key, value);
  }

  async setItem(key: string, value: string) {
    this.checkFailure();
    this.data.set(key, value);
  }

  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }

  async removeItem(key: string) {
    this.data.delete(key);
  }

  async multiRemove(keys: readonly string[]) {
    for (const key of keys) this.data.delete(key);
  }

  private checkFailure() {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('Simulated storage failure');
    }
  }
}
