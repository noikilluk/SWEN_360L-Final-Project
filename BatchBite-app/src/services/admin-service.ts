/**
 * Administrator tools: manage accounts, roles and system settings.
 */
import { ensure } from '@/domain/errors';
import { requireCapability } from '@/domain/permissions';
import type { ID, Settings, User, UserRole } from '@/domain/types';
import {
  normaliseUsername,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from '@/domain/validation';

import { type ServiceContext, loadActor } from './context';

export interface NewUserInput {
  username: string;
  displayName: string;
  role: UserRole;
  password: string;
}

export class AdminService {
  constructor(private readonly ctx: ServiceContext) {}

  async createUser(actorId: ID, input: NewUserInput): Promise<User> {
    requireCapability(this.ctx.db.getState().users[actorId], 'manageUsers');
    const username = normaliseUsername(input.username);
    const problem = validateUsername(username) ?? validateDisplayName(input.displayName) ?? validatePassword(input.password);
    ensure(!problem, 'VALIDATION', problem ?? '');
    const salt = this.ctx.crypto.newSalt();
    const passwordHash = await this.ctx.crypto.hashPassword(input.password, salt);
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageUsers');
      ensure(!tx.all('users').some((u) => u.username === username), 'CONFLICT', 'That username is already taken.');
      return tx.put('users', {
        id: this.ctx.crypto.randomId(),
        username,
        displayName: input.displayName.trim(),
        passwordHash,
        salt,
        role: input.role,
        active: true,
        // Staff choose their own password the first time they log in.
        mustChangePassword: true,
        createdAt: this.ctx.now().toISOString(),
      });
    });
  }

  updateUser(actorId: ID, userId: ID, changes: { displayName?: string; role?: UserRole; active?: boolean }) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageUsers');
      const user = tx.require('users', userId, 'account');
      if (changes.displayName !== undefined) {
        const problem = validateDisplayName(changes.displayName);
        ensure(!problem, 'VALIDATION', problem ?? '');
      }
      const losesAdmin =
        user.role === 'admin' &&
        ((changes.role !== undefined && changes.role !== 'admin') || changes.active === false);
      if (losesAdmin) {
        ensure(userId !== actorId, 'FORBIDDEN', 'You cannot remove your own administrator access.');
        const otherAdmins = tx.all('users').filter((u) => u.role === 'admin' && u.active && u.id !== userId);
        ensure(otherAdmins.length > 0, 'CONFLICT', 'There must always be at least one active administrator.');
      }
      ensure(!(changes.active === false && userId === actorId), 'FORBIDDEN', 'You cannot deactivate your own account.');
      return tx.put('users', {
        ...user,
        displayName: changes.displayName?.trim() ?? user.displayName,
        role: changes.role ?? user.role,
        active: changes.active ?? user.active,
      });
    });
  }

  /** Sets a temporary password and closes any pending reset request for the user. */
  async issueTemporaryPassword(actorId: ID, userId: ID): Promise<string> {
    requireCapability(this.ctx.db.getState().users[actorId], 'manageUsers');
    const temporary = `bb-${this.ctx.crypto.randomCode(4).toLowerCase()}-${this.ctx.crypto.randomCode(4).toLowerCase()}`;
    const salt = this.ctx.crypto.newSalt();
    const passwordHash = await this.ctx.crypto.hashPassword(temporary, salt);
    await this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageUsers');
      const user = tx.require('users', userId, 'account');
      tx.put('users', { ...user, salt, passwordHash, mustChangePassword: true });
      const now = this.ctx.now().toISOString();
      for (const request of tx.all('resetRequests')) {
        if (request.userId === userId && request.status === 'pending') {
          tx.put('resetRequests', { ...request, status: 'resolved', resolvedAt: now, resolvedBy: actorId });
        }
      }
    });
    return temporary;
  }

  dismissResetRequest(actorId: ID, requestId: ID) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageUsers');
      const request = tx.require('resetRequests', requestId, 'request');
      tx.put('resetRequests', { ...request, status: 'dismissed', resolvedAt: this.ctx.now().toISOString(), resolvedBy: actorId });
    });
  }

  updateSettings(actorId: ID, changes: Partial<Settings>) {
    return this.ctx.db.transaction((tx) => {
      requireCapability(loadActor(tx, actorId), 'manageSettings');
      const next = { ...tx.read('settings'), ...changes };
      ensure(next.businessName.trim().length > 0 && next.businessName.length <= 40, 'VALIDATION', 'Enter a business name of up to 40 characters.');
      const whole = (value: number, min: number, max: number, label: string) =>
        ensure(Number.isInteger(value) && value >= min && value <= max, 'VALIDATION', `${label} must be between ${min} and ${max}.`);
      whole(next.closingSoonHours, 1, 168, '"Closing soon" hours');
      whole(next.pickupGraceMinutes, 0, 720, 'The pickup grace period');
      whole(next.defaultSlotMinutes, 5, 240, 'The slot length');
      whole(next.defaultSlotCapacity, 1, 200, 'Orders per slot');
      whole(next.defaultSlotsPerBatch, 1, 24, 'Slots per batch');
      ensure(/^\d{4}$/.test(next.simulatedCardLast4), 'VALIDATION', 'The card ending must be 4 digits.');
      tx.setDocument('settings', { ...next, businessName: next.businessName.trim() });
    });
  }
}
