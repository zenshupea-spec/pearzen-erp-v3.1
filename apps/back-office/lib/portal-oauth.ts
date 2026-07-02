import {
  loginPathForStaffPortal,
  portalHomePath,
  type StaffPortalId,
} from './portal-isolation';

export function isStaffPortalId(
  value: string | null | undefined,
): value is StaffPortalId {
  return value === 'md' || value === 'om' || value === 'tm' || value === 'hq';
}

export function oauthErrorPathForCallback(
  nextPath: string,
  staffPortal: StaffPortalId | null,
): string {
  if (staffPortal) return loginPathForStaffPortal(staffPortal);
  if (nextPath.startsWith('/partners')) return '/login/partners';
  if (nextPath.startsWith('/pears')) return '/login/pears';
  if (nextPath.startsWith('/forge')) return '/login/forge';
  return '/login/hq';
}

export function resolveStaffPortalOAuthNext(
  nextParam: string | null,
  staffPortal: StaffPortalId | null,
): string {
  if (nextParam?.startsWith('/')) return nextParam;
  if (staffPortal) return portalHomePath(staffPortal);
  return '/';
}

export function shouldUseForgeOAuthFlow(
  nextPath: string,
  staffPortal: StaffPortalId | null,
): boolean {
  return nextPath.startsWith('/forge') && !staffPortal;
}
