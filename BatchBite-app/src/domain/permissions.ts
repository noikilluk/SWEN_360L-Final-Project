/**
 * Role based permissions (FR-01, NFR-03). Services check these on every call,
 * so the rules hold even if a screen forgets to hide a button.
 */
import { AppError } from './errors';
import type { User, UserRole } from './types';

export const CAPABILITIES = {
  placeOrders: ['customer'],
  manageProducts: ['owner'],
  manageBatches: ['owner'],
  manageIngredients: ['owner'],
  manageSlots: ['owner'],
  viewAllOrders: ['owner', 'kitchen'],
  updateProduction: ['owner', 'kitchen'],
  cancelOrders: ['owner'],
  issueRefunds: ['owner'],
  resolveChangeRequests: ['owner'],
  assignTasks: ['owner'],
  workOnTasks: ['owner', 'kitchen'],
  verifyCollection: ['owner', 'kitchen'],
  reportDelays: ['owner', 'kitchen'],
  viewInsights: ['owner'],
  manageUsers: ['admin'],
  manageSettings: ['admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(user: Pick<User, 'role'> | null | undefined, capability: Capability): boolean {
  if (!user) return false;
  return (CAPABILITIES[capability] as readonly UserRole[]).includes(user.role);
}

export function requireCapability(user: User | null | undefined, capability: Capability): asserts user is User {
  if (!user) {
    throw new AppError('FORBIDDEN', 'Please log in first.');
  }
  if (!user.active) {
    throw new AppError('FORBIDDEN', 'This account has been deactivated.');
  }
  if (!can(user, capability)) {
    throw new AppError('FORBIDDEN', 'Your account does not have permission to do that.');
  }
}
