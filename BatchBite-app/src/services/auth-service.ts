/**
 * Accounts: sign up, log in, change password and "forgot password" requests
 * (US-01, FR-01, NFR-03).
 *
 * Passwords are salted and hashed before they are stored. Five failed log in
 * attempts lock the username for one minute to slow down guessing.
 */
import { AppError, ensure } from '@/domain/errors';
import type { ID, User } from '@/domain/types';
import {
  normaliseUsername,
  validateDisplayName,
  validatePassword,
  validatePasswordConfirmation,
  validateUsername,
} from '@/domain/validation';

import { type ServiceContext, loadActor } from './context';
import { notifyRoles } from './notification-service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

export interface SignUpInput {
  username: string;
  password: string;
  confirmPassword: string;
  displayName?: string;
}

export class AuthService {
  private readonly failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

  constructor(private readonly ctx: ServiceContext) {}

  /** Creates a customer account. Staff accounts are created by an administrator. */
  async signUp(input: SignUpInput): Promise<User> {
    const username = normaliseUsername(input.username);
    const problem =
      validateUsername(username) ??
      validatePassword(input.password) ??
      validatePasswordConfirmation(input.password, input.confirmPassword);
    ensure(!problem, 'VALIDATION', problem ?? '');

    const salt = this.ctx.crypto.newSalt();
    const passwordHash = await this.ctx.crypto.hashPassword(input.password, salt);

    return this.ctx.db.transaction((tx) => {
      const taken = tx.all('users').some((u) => u.username === username);
      ensure(!taken, 'CONFLICT', 'That username is already taken. Try another one.');
      const user: User = {
        id: this.ctx.crypto.randomId(),
        username,
        displayName: input.displayName?.trim() || username,
        passwordHash,
        salt,
        role: 'customer',
        active: true,
        mustChangePassword: false,
        createdAt: this.ctx.now().toISOString(),
      };
      tx.put('users', user);
      return user;
    });
  }

  async logIn(usernameInput: string, password: string): Promise<User> {
    const username = normaliseUsername(usernameInput);
    ensure(username && password, 'VALIDATION', 'Enter your username and password.');

    const attempts = this.failedAttempts.get(username);
    const now = this.ctx.now().getTime();
    if (attempts && attempts.lockedUntil > now) {
      const seconds = Math.ceil((attempts.lockedUntil - now) / 1000);
      throw new AppError('ACCOUNT_LOCKED', `Too many attempts. Try again in ${seconds} seconds.`);
    }

    const user = Object.values(this.ctx.db.getState().users).find((u) => u.username === username);
    // Hash even when the user does not exist so timing does not reveal valid usernames.
    const hash = await this.ctx.crypto.hashPassword(password, user?.salt ?? 'unknown-user');
    if (!user || hash !== user.passwordHash) {
      this.recordFailure(username, now);
      throw new AppError('AUTH_FAILED', 'Incorrect username or password.');
    }
    ensure(user.active, 'FORBIDDEN', 'This account has been deactivated. Contact the administrator.');
    this.failedAttempts.delete(username);
    return user;
  }

  async changePassword(actorId: ID, currentPassword: string, newPassword: string, confirmation: string) {
    const problem = validatePassword(newPassword) ?? validatePasswordConfirmation(newPassword, confirmation);
    ensure(!problem, 'VALIDATION', problem ?? '');
    const actor = this.ctx.db.getState().users[actorId];
    ensure(actor, 'FORBIDDEN', 'Please log in again.');
    const currentHash = await this.ctx.crypto.hashPassword(currentPassword, actor.salt);
    ensure(currentHash === actor.passwordHash, 'AUTH_FAILED', 'Your current password is incorrect.');
    ensure(currentPassword !== newPassword, 'VALIDATION', 'Choose a password you have not used just now.');

    const salt = this.ctx.crypto.newSalt();
    const passwordHash = await this.ctx.crypto.hashPassword(newPassword, salt);
    await this.ctx.db.transaction((tx) => {
      const fresh = loadActor(tx, actorId);
      tx.put('users', { ...fresh, salt, passwordHash, mustChangePassword: false });
    });
  }

  async updateProfile(actorId: ID, displayName: string) {
    const problem = validateDisplayName(displayName);
    ensure(!problem, 'VALIDATION', problem ?? '');
    await this.ctx.db.transaction((tx) => {
      const actor = loadActor(tx, actorId);
      tx.put('users', { ...actor, displayName: displayName.trim() });
    });
  }

  /**
   * There is no email server, so a forgotten password is handled by the
   * administrator: this records a request and alerts every admin, who then
   * issues a temporary password from the Users screen.
   */
  async requestPasswordReset(usernameInput: string): Promise<void> {
    const username = normaliseUsername(usernameInput);
    const problem = validateUsername(username);
    ensure(!problem, 'VALIDATION', problem ?? '');
    await this.ctx.db.transaction((tx) => {
      const user = tx.all('users').find((u) => u.username === username);
      // Respond the same way whether or not the account exists.
      if (!user) return;
      const alreadyPending = tx
        .all('resetRequests')
        .some((r) => r.userId === user.id && r.status === 'pending');
      if (alreadyPending) return;
      tx.put('resetRequests', {
        id: this.ctx.crypto.randomId(),
        userId: user.id,
        username: user.username,
        status: 'pending',
        createdAt: this.ctx.now().toISOString(),
      });
      notifyRoles(tx, this.ctx, ['admin'], {
        kind: 'password_reset_requested',
        title: 'Password reset requested',
        body: `${user.username} asked for a new password. Open Users to issue a temporary one.`,
      });
    });
  }

  private recordFailure(username: string, now: number) {
    const entry = this.failedAttempts.get(username) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.count = 0;
      entry.lockedUntil = now + LOCKOUT_MS;
    }
    this.failedAttempts.set(username, entry);
  }
}
