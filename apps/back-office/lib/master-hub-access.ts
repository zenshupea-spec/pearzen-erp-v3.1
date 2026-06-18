import { canAccessPortalActivityLedger } from './audit-portals';
import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';
import {
  CAFE_FRONT_PORTAL_ROUTE,
  GUARD_FIELD_PORTAL_ROUTE,
  SM_PORTAL_ROUTE,
} from './master-hub-pillars';

/** Role gate for Master Hub module cards (server-safe). */
export function canSeeMasterHubModule(route: string, role: string): boolean {
  const normalized = normalizePortalRole(role) ?? role.trim().toUpperCase();
  if (isExecutiveRank(normalized)) return true;

  if (route === '/security-website') return isExecutiveRank(normalized);

  if (route === '/hq/audit') return canAccessPortalActivityLedger(role);

  if (normalized === 'EA') return false;

  if (route === '/executive/cafe') return role === 'HR' || role === 'FM';
  if (route.startsWith('/executive')) return false;
  if (route === '/tm') return false;
  if (route === '/om') return false;
  if (route === '/hr' || route.startsWith('/hr/')) {
    return role === 'HR' || role === 'FM';
  }
  if (route === '/fm' || route.startsWith('/fm/')) {
    return role === 'FM' || role === 'HR';
  }
  if (route === GUARD_FIELD_PORTAL_ROUTE) return role === 'HR' || role === 'FM';
  if (route === SM_PORTAL_ROUTE) return role === 'HR' || role === 'FM';
  if (route === CAFE_FRONT_PORTAL_ROUTE) return role === 'HR' || role === 'FM';
  if (route.startsWith('/hq/')) return role === 'HR' || role === 'FM';
  if (route === '/invoice-desk') return role === 'FM' || role === 'HR';

  return false;
}
