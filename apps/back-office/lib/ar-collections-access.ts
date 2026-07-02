import { normalizePortalRole } from './portal-role-utils';

/** Edge-safe AR collections route guard (no Node crypto). */
export function canAccessArCollections(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  if (!normalized) return false;
  return normalized === 'MD' || normalized === 'OD' || normalized === 'EA';
}
