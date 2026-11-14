import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StorageAdapter } from './storage';

/**
 * AsyncStorage backed storage. On Android and iOS data lives in the app's
 * private storage; on web it uses the browser's localStorage. Both survive app
 * restarts, which covers the "persist data across sessions" requirement.
 */
export const asyncStorageAdapter: StorageAdapter = {
  multiGet: (keys) => AsyncStorage.multiGet(keys),
  multiSet: (pairs) => AsyncStorage.multiSet(pairs),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  getItem: (key) => AsyncStorage.getItem(key),
  removeItem: (key) => AsyncStorage.removeItem(key),
  multiRemove: (keys) => AsyncStorage.multiRemove(keys),
};
