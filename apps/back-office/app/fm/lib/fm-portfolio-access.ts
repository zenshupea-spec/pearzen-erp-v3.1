import { canAccessPathViaPortalRbac } from '../../../../../packages/portal-rbac';
import type { BackOfficeUserProfile } from '../../../lib/hr-portal-access';
import { normalizePortalRole } from '../../../lib/portal-role-utils';

export function canPerformFmPortfolioWrite(profile: BackOfficeUserProfile): boolean {
  const role = normalizePortalRole(profile.role);
  if (role === 'FM' || role === 'MD' || role === 'OD') return true;
  if (profile.rbacGated) {
    return canAccessPathViaPortalRbac('/fm', profile.portalRbac ?? undefined, {
      writeRequired: true,
    });
  }
  return false;
}

export function canPerformFmPortfolioRead(profile: BackOfficeUserProfile): boolean {
  const role = normalizePortalRole(profile.role);
  if (role === 'FM' || role === 'MD' || role === 'OD') return true;
  if (profile.rbacGated) {
    return canAccessPathViaPortalRbac('/fm', profile.portalRbac ?? undefined);
  }
  return false;
}
