/**
 * Date helpers. All values are stored as ISO strings (UTC) and displayed in the
 * device's local time zone. Formatting is done by hand so it is identical on
 * Android, iOS and web, which do not all ship the same Intl data.
 */
import type { Timestamp } from './types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function toDate(value: Timestamp | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function addMinutes(value: Timestamp | Date, minutes: number): Date {
  return new Date(toDate(value).getTime() + minutes * MINUTE);
}

export function addDays(value: Timestamp | Date, days: number): Date {
  const date = new Date(toDate(value));
  date.setDate(date.getDate() + days);
  return date;
}

/** Local midnight at the start of the given day. */
export function startOfDay(value: Timestamp | Date): Date {
  const date = new Date(toDate(value));
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Local calendar key such as `2026-10-22`, used to group by day. */
export function dayKey(value: Timestamp | Date): string {
  const date = toDate(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isSameDay(a: Timestamp | Date, b: Timestamp | Date): boolean {
  return dayKey(a) === dayKey(b);
}

/** `4:00 pm` */
export function formatTime(value: Timestamp | Date): string {
  const date = toDate(value);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

/** `Thu 22 Oct` */
export function formatDay(value: Timestamp | Date): string {
  const date = toDate(value);
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

/** `Thu 22 Oct, 4:00 pm` */
export function formatDateTime(value: Timestamp | Date): string {
  return `${formatDay(value)}, ${formatTime(value)}`;
}

/** `10/22/2026` (matches the Create batch wireframe). */
export function formatNumericDate(value: Timestamp | Date): string {
  const date = toDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/**
 * Relative day label: `today`, `tomorrow`, or `Thu 22 Oct`.
 */
export function formatRelativeDay(value: Timestamp | Date, now: Date): string {
  if (isSameDay(value, now)) return 'today';
  if (isSameDay(value, addDays(now, 1))) return 'tomorrow';
  return formatDay(value);
}

/** `Closes today, 3:00 pm` style label used on batch cards. */
export function formatRelativeDateTime(value: Timestamp | Date, now: Date): string {
  const day = formatRelativeDay(value, now);
  return `${day}, ${formatTime(value)}`;
}

/** Short duration such as `45 min`, `3 h 20 min` or `2 days`. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  return `${Math.round(hours / 24)} days`;
}

/** `5 min ago`, `2 h ago`, `Thu 22 Oct`. */
export function formatAgo(value: Timestamp | Date, now: Date): string {
  const diff = now.getTime() - toDate(value).getTime();
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  return formatDay(value);
}

/** Combines the calendar day of `day` with the hours and minutes of `time`. */
export function combineDayAndTime(day: Date, hours: number, minutes: number): Date {
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}
