import type { Fils } from './types';

export const FILS_PER_BD = 1000;

/**
 * Formats fils as Bahraini dinars, for example `4500` -> `BD 4.50` and
 * `4525` -> `BD 4.525`. Two decimals are used unless the third is needed.
 */
export function formatMoney(fils: Fils): string {
  const negative = fils < 0;
  const abs = Math.abs(Math.round(fils));
  const decimals = abs % 10 === 0 ? 2 : 3;
  const text = (abs / FILS_PER_BD).toFixed(decimals);
  return `${negative ? '-' : ''}BD ${text}`;
}

/**
 * Parses a dinar amount typed by a user ("4.5", "4.500", "BD 4.50") into fils.
 * Returns `null` when the text is not a valid non-negative amount.
 */
export function parseMoney(text: string): Fils | null {
  const cleaned = text.replace(/bd/i, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{0,3})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  return Number(whole) * FILS_PER_BD + Number(fraction.padEnd(3, '0'));
}

/** Plain dinar text without the currency prefix, used to prefill inputs. */
export function filsToInput(fils: Fils): string {
  return (fils / FILS_PER_BD).toFixed(fils % 10 === 0 ? 2 : 3);
}
