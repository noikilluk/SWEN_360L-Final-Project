import type { Href } from 'expo-router';

import type { UserRole } from '@/domain/types';

/**
 * Home screen of each role's tab group. Expo Router's generated route types
 * list these as `/customer/index` etc., while the router itself resolves the
 * shorter URL, so the cast keeps the clean URLs.
 */
export const HOME_HREF: Record<UserRole, Href> = {
  customer: '/customer' as Href,
  owner: '/owner' as Href,
  kitchen: '/kitchen' as Href,
  admin: '/admin' as Href,
};

export function homeHrefFor(role: UserRole): Href {
  return HOME_HREF[role];
}
