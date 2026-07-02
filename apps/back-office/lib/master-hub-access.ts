import {
  accessLevelAllows,
  canAccessPathViaPortalRbac,
  type PortalAccessLevel,
  type PortalRbacPortalId,
} from '../../../packages/portal-rbac';
import { canAccessHqAuditRoute } from './audit-portals';
import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';
import {
  CAFE_FRONT_PORTAL_ROUTE,
  GUARD_FIELD_PORTAL_ROUTE,
  SHALOM_FRONT_PORTAL_ROUTE,
  SM_PORTAL_ROUTE,
} from './master-hub-pillars';

export type MasterHubAccessContext = {
  rbacGated?: boolean;
  portalRbac?: Record<string, PortalAccessLevel> | null;
};

/** Map Master Hub tile routes (including external proxy keys) to RBAC portal columns. */
export function masterHubRoutePortalId(route: string): PortalRbacPortalId | null {
  switch (route) {
    case SM_PORTAL_ROUTE:
      return 'sm_portal';
    case GUARD_FIELD_PORTAL_ROUTE:
      return 'checkin_app';
    case CAFE_FRONT_PORTAL_ROUTE:
      return 'cafe';
    case SHALOM_FRONT_PORTAL_ROUTE:
      return 'cafe';
    case '/security-website':
    case '/shalom-public':
      return 'client_portal';
    case '/om':
      return 'om_command';
    case '/tm':
      return 'tm_command';
    case '/fm':
      return 'finance';
    case '/hq/deductions':
      return 'deductions';
    case '/invoice-desk':
      return 'invoice_desk';
    case '/hr':
    case '/hr/mnr':
      return 'hr_desk';
    case '/hr/vacancies':
      return 'vacancies';
    case '/executive/cafe':
      return 'cafe';
    case '/hq/audit':
      return 'audit_ledger';
    case '/hq/guard-proxy':
      return 'checkin_app';
    default:
      if (route.startsWith('/hr/')) {
        return route.startsWith('/hr/vacancies') ? 'vacancies' : 'hr_desk';
      }
      if (route.startsWith('/fm')) return 'finance';
      if (route.startsWith('/hq/')) return null;
      return null;
  }
}

function canSeeMasterHubModuleViaPortalRbac(
  route: string,
  portalRbac: Record<string, PortalAccessLevel> | undefined,
): boolean {
  const portalId = masterHubRoutePortalId(route);
  if (portalId) {
    return accessLevelAllows(portalRbac?.[portalId], false);
  }
  if (route.startsWith('/')) {
    return canAccessPathViaPortalRbac(route, portalRbac);
  }
  return false;
}

/** Role gate for Master Hub module cards (server-safe). */
export function canSeeMasterHubModule(
  route: string,
  role: string,
  context?: MasterHubAccessContext,
): boolean {
  if (context?.rbacGated) {
    return canSeeMasterHubModuleViaPortalRbac(route, context.portalRbac ?? undefined);
  }

  const normalized = normalizePortalRole(role) ?? role.trim().toUpperCase();
  if (isExecutiveRank(normalized)) return true;

  if (route === '/security-website' || route === '/shalom-public') {
    return isExecutiveRank(normalized);
  }

  if (route === '/hq/audit') {
    return canAccessHqAuditRoute({
      role,
      rbacGated: context?.rbacGated,
      portalRbac: context?.portalRbac,
    });
  }

  if (normalized === 'EA') return false;

  if (route === '/executive/cafe') return role === 'HR' || role === 'FM';
  if (route.startsWith('/executive')) return false;
  if (route === '/tm') return false;
  if (route === '/om') return false;
  if (route === '/hr' || route.startsWith('/hr/')) {
    return role === 'HR' || role === 'FM';
  }
  if (route === '/hq/guard-proxy' || route.startsWith('/hq/guard-proxy/')) {
    return role === 'HR' || role === 'FM';
  }
  if (route === '/fm' || route.startsWith('/fm/')) {
    return role === 'FM' || role === 'HR';
  }
  if (route === GUARD_FIELD_PORTAL_ROUTE) return role === 'HR' || role === 'FM';
  if (route === SM_PORTAL_ROUTE) return role === 'HR' || role === 'FM';
  if (route === CAFE_FRONT_PORTAL_ROUTE) return role === 'HR' || role === 'FM';
  if (route === SHALOM_FRONT_PORTAL_ROUTE) return role === 'HR' || role === 'FM';
  if (route.startsWith('/hq/')) return role === 'HR' || role === 'FM';
  if (route === '/invoice-desk') return role === 'FM' || role === 'HR';

  return false;
}
