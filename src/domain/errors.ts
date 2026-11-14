/**
 * Error type used by every service. The `message` is written for end users so
 * screens can show it directly; the `code` lets screens react to specific cases
 * (for example offering to clear the cart on a collection date conflict).
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'AUTH_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'CONFLICT'
  | 'SOLD_OUT'
  | 'ORDERING_CLOSED'
  | 'SLOT_FULL'
  | 'INSUFFICIENT_INGREDIENTS'
  | 'INVALID_TRANSITION'
  | 'CART_DATE_CONFLICT'
  | 'INVALID_CODE'
  | 'STORAGE';

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/** Throws an AppError when `condition` is false. */
export function ensure(condition: unknown, code: ErrorCode, message: string): asserts condition {
  if (!condition) {
    throw new AppError(code, message);
  }
}

/** Turns any thrown value into a message that is safe to show to a user. */
export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message) {
    return `Something went wrong: ${error.message}`;
  }
  return 'Something went wrong. Please try again.';
}
