import type { BackOfficeUserProfile } from './hr-portal-access';
import { EXECUTIVE_DESK_PATH, HQ_HUB_PATH } from './hq-hub';
import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';

/** Four isolated staff portals — separate sign-in URLs and route boundaries. */
export type StaffPortalId = 'md' | 'om' | 'tm' | 'hq';

export const PORTAL_LOGIN_PATHS: Record<StaffPortalId, string> = {
  md: '/login/md',
  om: '/login/om',
  tm: '/login/tm',
  hq: '/login/hq',
};

export const HQ_STAFF_RANKS = ['HR', 'FM', 'EA'] as const;

const TM_SHARED_OM_PREFIXES = ['/om/sites/location', '/om/guard-cards'] as const;

export function staffPortalIdForRole(
  role: string | null | undefined,
  profile?: Pick<BackOfficeUserProfile, 'rbacGated'>,
): StaffPortalId | null {
  const normalized = normalizePortalRole(role);
  if (!normalized) return null;
  if (isExecutiveRank(normalized)) return 'md';
  if (normalized === 'OM') return 'om';
  if (normalized === 'TM') return 'tm';
  if (
    (HQ_STAFF_RANKS as readonly string[]).includes(normalized) ||
    profile?.rbacGated
  ) {
    return 'hq';
  }
  return null;
}

export function loginPathForStaffPortal(portal: StaffPortalId): string {
  return PORTAL_LOGIN_PATHS[portal];
}

export function loginPathForRole(
  role: string | null | undefined,
  profile?: Pick<BackOfficeUserProfile, 'rbacGated'>,
): string {
  const portal = staffPortalIdForRole(role, profile);
  return portal ? loginPathForStaffPortal(portal) : '/login';
}

export function portalHomePath(portal: StaffPortalId): string {
  switch (portal) {
    case 'md':
      return EXECUTIVE_DESK_PATH;
    case 'om':
      return '/om';
    case 'tm':
      return '/tm';
    case 'hq':
      return HQ_HUB_PATH;
  }
}

export function isTmSharedOmPath(pathname: string): boolean {
  return TM_SHARED_OM_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isCafeBackofficePath(pathname: string): boolean {
  return pathname === '/executive/cafe' || pathname.startsWith('/executive/cafe/');
}

/** HQ staff café backoffice (hub shell) — not the full MD executive café desk. */
export function isHqCafeBackofficePath(pathname: string, search = ''): boolean {
  if (!isCafeBackofficePath(pathname)) return false;
  if (search.includes('hub=1')) return true;
  return false;
}

export function pathBelongsToStaffPortal(
  pathname: string,
  portal: StaffPortalId,
  search = '',
): boolean {
  switch (portal) {
    case 'md':
      if (isCafeBackofficePath(pathname) && isHqCafeBackofficePath(pathname, search)) {
        return false;
      }
      return pathname === '/executive' || pathname.startsWith('/executive/');
    case 'om':
      return pathname === '/om' || pathname.startsWith('/om/');
    case 'tm':
      return pathname === '/tm' || pathname.startsWith('/tm/');
    case 'hq':
      if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return true;
      if (pathname === '/hq' || pathname.startsWith('/hq/')) return true;
      if (pathname === '/hr' || pathname.startsWith('/hr/')) return true;
      if (pathname === '/fm' || pathname.startsWith('/fm/')) return true;
      if (pathname === '/fm-dashboard' || pathname.startsWith('/fm-dashboard/')) return true;
      if (pathname === '/invoice-desk' || pathname.startsWith('/invoice-desk/')) return true;
      if (isCafeBackofficePath(pathname)) return true;
      return false;
  }
}

export function staffPortalForPath(
  pathname: string,
  search = '',
): StaffPortalId | null {
  if (pathBelongsToStaffPortal(pathname, 'om', search)) return 'om';
  if (pathBelongsToStaffPortal(pathname, 'tm', search)) return 'tm';
  if (pathBelongsToStaffPortal(pathname, 'hq', search)) return 'hq';
  if (pathBelongsToStaffPortal(pathname, 'md', search)) return 'md';
  return null;
}

export function loginPathForRequestPath(pathname: string, search = ''): string {
  const portal = staffPortalForPath(pathname, search);
  if (portal) return loginPathForStaffPortal(portal);
  if (pathname.startsWith('/executive')) return PORTAL_LOGIN_PATHS.md;
  if (pathname.startsWith('/om')) return PORTAL_LOGIN_PATHS.om;
  if (pathname.startsWith('/tm')) return PORTAL_LOGIN_PATHS.tm;
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/hq') ||
    pathname.startsWith('/hr') ||
    pathname.startsWith('/fm') ||
    pathname.startsWith('/invoice-desk')
  ) {
    return PORTAL_LOGIN_PATHS.hq;
  }
  return '/login';
}

export function roleMatchesStaffPortal(
  role: string | null | undefined,
  portal: StaffPortalId,
  profile?: Pick<BackOfficeUserProfile, 'rbacGated'>,
): boolean {
  return staffPortalIdForRole(role, profile) === portal;
}

function isExecutiveCrossPortalPath(pathname: string, search = ''): boolean {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return true;
  if (pathBelongsToStaffPortal(pathname, 'hq', search)) return true;
  if (pathBelongsToStaffPortal(pathname, 'om', search)) return true;
  if (pathBelongsToStaffPortal(pathname, 'tm', search)) return true;
  return false;
}

export function canAccessPathInStaffPortal(
  pathname: string,
  profile: BackOfficeUserProfile,
  search = '',
): boolean {
  const portal = staffPortalIdForRole(profile.role, profile);
  if (!portal) return false;

  const normalized = normalizePortalRole(profile.role);
  if (isExecutiveRank(normalized)) {
    if (pathBelongsToStaffPortal(pathname, 'md', search)) return true;
    if (isExecutiveCrossPortalPath(pathname, search)) return true;
    return false;
  }

  if (portal === 'tm' && isTmSharedOmPath(pathname)) {
    return true;
  }

  if (!pathBelongsToStaffPortal(pathname, portal, search)) {
    return false;
  }

  if (portal === 'hq' && isCafeBackofficePath(pathname)) {
    const normalized = normalizePortalRole(profile.role);
    return (
      isExecutiveRank(normalized) === false &&
      (normalized === 'HR' || normalized === 'FM' || profile.rbacGated === true)
    );
  }

  return true;
}

export const PORTAL_GATEWAY_CARDS: {
  id: StaffPortalId;
  title: string;
  subtitle: string;
  href: string;
}[] = [
  {
    id: 'md',
    title: 'MD Portal',
    subtitle: 'Executive vault · finance · enterprise command',
    href: PORTAL_LOGIN_PATHS.md,
  },
  {
    id: 'om',
    title: 'OM Portal',
    subtitle: 'Field operations · site allocation · guard cards',
    href: PORTAL_LOGIN_PATHS.om,
  },
  {
    id: 'tm',
    title: 'TM Portal',
    subtitle: 'Territory oversight · shift verification',
    href: PORTAL_LOGIN_PATHS.tm,
  },
  {
    id: 'hq',
    title: 'HQ Staff Portal',
    subtitle: 'HR · finance desk · deductions · hub modules',
    href: PORTAL_LOGIN_PATHS.hq,
  },
];
