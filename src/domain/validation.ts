/**
 * Input validation shared by screens (for inline messages) and services (as
 * the final check). Each function returns an error message or `null`.
 */

export const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;
export const MIN_PASSWORD_LENGTH = 8;

export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  const value = normaliseUsername(username);
  if (!value) return 'Enter a username.';
  if (value.length < 3) return 'Usernames need at least 3 characters.';
  if (value.length > 20) return 'Usernames can have at most 20 characters.';
  if (!USERNAME_PATTERN.test(value)) return 'Use only letters, numbers, dots and underscores.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 128) return 'Passwords can have at most 128 characters.';
  return null;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation) return 'Re-enter your password.';
  if (password !== confirmation) return 'The passwords do not match.';
  return null;
}

export function validateDisplayName(name: string): string | null {
  const value = name.trim();
  if (!value) return 'Enter a name.';
  if (value.length > 40) return 'Names can have at most 40 characters.';
  return null;
}

export function validateRequiredText(value: string, label: string, max = 120): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `Enter ${label}.`;
  if (trimmed.length > max) return `${capitalise(label)} can have at most ${max} characters.`;
  return null;
}

export function validatePositiveInteger(value: number, label: string, max = 10_000): string | null {
  if (!Number.isInteger(value) || value <= 0) return `${capitalise(label)} must be a whole number above 0.`;
  if (value > max) return `${capitalise(label)} can be at most ${max}.`;
  return null;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
