/**
 * Boots the app: opens the local database, loads demo data on first launch,
 * restores the signed-in user and runs the background checks (missed pickups)
 * once a minute while the app is open.
 */
import { type ReactNode, use, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { asyncStorageAdapter } from '@/data/async-storage-adapter';
import { Database } from '@/data/database';
import type { DbKey, DbState } from '@/data/schema';
import { buildDemoState } from '@/data/seed';
import { errorMessage } from '@/domain/errors';
import type { ID, User } from '@/domain/types';
import { expoCrypto } from '@/lib/crypto';
import { type Services, createServices } from '@/services';

import { AppContext, type AppContextValue } from './app-context';

const SESSION_KEY = 'batchbite:session';
const CHECK_INTERVAL_MS = 60_000;

type Boot =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; db: Database; services: Services; userId: ID | null; recoveredKeys: DbKey[] };

async function boot(): Promise<Extract<Boot, { status: 'ready' }>> {
  const { db, recoveredKeys } = await Database.open(asyncStorageAdapter);
  if (!db.getState().meta.seededAt && Object.keys(db.getState().users).length === 0) {
    await db.replaceAll(await buildDemoState(expoCrypto, new Date()));
  }
  const services = createServices({ db, crypto: expoCrypto, now: () => new Date() });
  const storedId = await asyncStorageAdapter.getItem(SESSION_KEY);
  const user = storedId ? db.getState().users[storedId] : undefined;
  return { status: 'ready', db, services, userId: user?.active ? user.id : null, recoveredKeys };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Boot>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    boot()
      .then((ready) => !cancelled && setState(ready))
      .catch((error: unknown) => !cancelled && setState({ status: 'error', message: errorMessage(error) }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const ready = state.status === 'ready' ? state : null;
  const services = ready?.services;

  // Missed-collection checks: on start, every minute, and when the app returns to the foreground.
  useEffect(() => {
    if (!services) return;
    const run = () => {
      services.orders.runScheduledChecks().catch(() => undefined);
    };
    run();
    const interval = setInterval(run, CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (next) => next === 'active' && run());
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [services]);

  const setUserId = useCallback((userId: ID | null) => {
    setState((current) => (current.status === 'ready' ? { ...current, userId } : current));
  }, []);

  const signIn = useCallback(
    async (user: User) => {
      await asyncStorageAdapter.setItem(SESSION_KEY, user.id);
      setUserId(user.id);
    },
    [setUserId],
  );

  const signOut = useCallback(async () => {
    await asyncStorageAdapter.removeItem(SESSION_KEY);
    setUserId(null);
  }, [setUserId]);

  const resetDemoData = useCallback(async () => {
    if (!ready) return;
    await ready.db.replaceAll(await buildDemoState(expoCrypto, new Date()));
    await asyncStorageAdapter.removeItem(SESSION_KEY);
    setUserId(null);
  }, [ready, setUserId]);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <AppText variant="label" color="textSecondary">
          Preparing your kitchen…
        </AppText>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.center}>
        <AppText variant="title" align="center">
          BatchBite could not start
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {state.message}
        </AppText>
        <Button
          title="Try again"
          variant="primary"
          onPress={() => {
            setState({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
        />
      </View>
    );
  }

  const value: AppContextValue = {
    db: state.db,
    services: state.services,
    userId: state.userId,
    signIn,
    signOut,
    resetDemoData,
    recoveredKeys: state.recoveredKeys,
  };
  return <AppContext value={value}>{children}</AppContext>;
}

export function useApp(): AppContextValue {
  const value = use(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function useServices(): Services {
  return useApp().services;
}

/** The whole database snapshot. Re-renders when any table changes. */
export function useDbState(): DbState {
  const { db } = useApp();
  return useSyncExternalStore(db.subscribe, db.getState, db.getState);
}

/** The signed-in user, or null. Deactivated accounts are treated as signed out. */
export function useCurrentUser(): User | null {
  const { userId } = useApp();
  const state = useDbState();
  const user = userId ? state.users[userId] : undefined;
  return user?.active ? user : null;
}

/** For screens that are only reachable while signed in. */
export function useRequiredUser(): User {
  const user = useCurrentUser();
  if (!user) throw new Error('This screen needs a signed-in user.');
  return user;
}

/** Current time, refreshed every `intervalMs` so deadlines and badges stay accurate. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.six,
    backgroundColor: Colors.background,
  },
});
