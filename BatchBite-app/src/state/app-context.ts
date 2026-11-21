/**
 * The React context lives in its own tiny module so that editing services or
 * the provider during development (Fast Refresh) does not create a new context
 * object and disconnect screens from the running provider.
 */
import { createContext } from 'react';

import type { Database } from '@/data/database';
import type { DbKey } from '@/data/schema';
import type { ID, User } from '@/domain/types';
import type { Services } from '@/services';

export interface AppContextValue {
  db: Database;
  services: Services;
  userId: ID | null;
  signIn: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
  /** Wipes everything and loads fresh demo data. */
  resetDemoData: () => Promise<void>;
  recoveredKeys: DbKey[];
}

export const AppContext = createContext<AppContextValue | null>(null);
