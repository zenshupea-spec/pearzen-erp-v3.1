import type { BackOfficeUserProfile } from './hr-portal-access';
import { isCafeFrontAuthEmail } from './cafe-front-auth-shared';
import { EXECUTIVE_DESK_PATH, HQ_HUB_PATH } from './hq-hub';
import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';
import { canAccessArCollections } from './ar-invoicing/payment-guards';
import { isShalomFrontAuthEmail } from './shalom-front-auth-shared';

/** Four isolated staff portals — separate sign-in URLs and route boundaries. */
export type StaffPortalId = 'md' | 'om' | 'tm' | 'hq';

export const PORTAL_LOGIN_PATHS: Record<StaffPortalId, string> = {
  md: '/login/md',
  om: '/login/om',
  tm: '/login/tm',
  hq: '/login/hq',
};

export const HQ_STAFF_RANKS = ['HR', 'FM', 'EA'] as const;

export const SHALOM_FIELD_STAFF_RANKS = ['CARETAKER', 'SHALOM_CARETAKER'] as const;
export const CAFE_FIELD_STAFF_RANKS = ['CAFE_STAFF'] as const;

const TM_SHARED_OM_PREFIXES = ['/om/sites/location', '/om/guard-cards'] as const;

function isArCollectionsPath(pathname: string): boolean {
  return pathname === '/ar-collections' || pathname.startsWith('/ar-collections/');
}

export function isShalomFieldStaffRank(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  return (
    normalized !== null &&
    (SHALOM_FIELD_STAFF_RANKS as readonly string[]).includes(normalized)
  );
}

export function isCafeFieldStaffRank(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  return (
    normalized !== null &&
    (CAFE_FIELD_STAFF_RANKS as readonly string[]).includes(normalized)
  );
}

export function isFieldStaffOnlyRank(role: string | null | undefined): boolean {
  return isShalomFieldStaffRank(role) || isCafeFieldStaffRank(role);
}

export function fieldStaffPortalHomePath(
  email: string | null | undefined,
  role?: string | null,
): string | null {
  if (email && isShalomFrontAuthEmail(email)) return '/shalom-front';
  if (email && isCafeFrontAuthEmail(email)) return '/cafe-front';
  if (isShalomFieldStaffRank(role)) return '/shalom-front';
  if (isCafeFieldStaffRank(role)) return '/cafe-front';
  return null;
}

export function fieldStaffLoginPath(
  email: string | null | undefined,
  role?: string | null,
): string | null {
  if (email && isShalomFrontAuthEmail(email)) return '/login/shalom-front';
  if (email && isCafeFrontAuthEmail(email)) return '/login/cafe-front';
  if (isShalomFieldStaffRank(role)) return '/login/shalom-front';
  if (isCafeFieldStaffRank(role)) return '/login/cafe-front';
  return null;
}

/** Routes HQ / executive staff portals that field PWA sessions must not access. */
export function isHeadOfficeProtectedPath(pathname: string, search = ''): boolean {
  if (pathname === '/' || pathname === '/hq') return true;
  if (pathname.startsWith('/executive')) return true;
  if (pathname.startsWith('/account')) return true;
  if (pathname.startsWith('/settings')) return true;
  if (pathname.startsWith('/ar-collections')) return true;
  if (pathname.startsWith('/forge')) return true;
  if (staffPortalForPath(pathname, search)) return true;
  return false;
}

/**
 * When a café or Shalom front session hits the wrong portal, return a redirect target.
 * Returns null when the request may proceed.
 */
export function resolveFieldStaffBoundaryRedirect(
  pathname: string,
  email: string | null | undefined,
  role: string | null | undefined,
  search = '',
): string | null {
  if (pathname.startsWith('/auth/')) return null;

  const shalomSession =
    Boolean(email && isShalomFrontAuthEmail(email)) || isShalomFieldStaffRank(role);
  const cafeSession =
    Boolean(email && isCafeFrontAuthEmail(email)) || isCafeFieldStaffRank(role);

  if (cafeSession && isShalomFrontPath(pathname)) {
    return fieldStaffPortalHomePath(email, role) ?? '/login/cafe-front?error=wrong_portal';
  }
  if (shalomSession && isCafeFrontPath(pathname)) {
    return fieldStaffPortalHomePath(email, role) ?? '/login/shalom-front?error=wrong_portal';
  }

  if (shalomSession) {
    if (isShalomFrontPath(pathname)) return null;
    if (pathname.startsWith('/login/shalom-front')) return null;
    if (pathname.startsWith('/login')) {
      return '/login/shalom-front?error=wrong_portal';
    }
    if (isHeadOfficeProtectedPath(pathname, search)) {
      return fieldStaffPortalHomePath(email, role) ?? '/login/shalom-front?error=wrong_portal';
    }
  }

  if (cafeSession) {
    if (isCafeFrontPath(pathname)) return null;
    if (pathname.startsWith('/login/cafe-front')) return null;
    if (pathname.startsWith('/login')) {
      return '/login/cafe-front?error=wrong_portal';
    }
    if (isHeadOfficeProtectedPath(pathname, search)) {
      return fieldStaffPortalHomePath(email, role) ?? '/login/cafe-front?error=wrong_portal';
    }
  }

  return null;
}

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
  email?: string | null,
): string {
  const fieldLogin = fieldStaffLoginPath(email, role);
  if (fieldLogin) return fieldLogin;
  const portal = staffPortalIdForRole(role, profile);
  return portal ? loginPathForStaffPortal(portal) : '/login';
}

export function portalPathForRole(
  role: string | null | undefined,
  profile?: Pick<BackOfficeUserProfile, 'rbacGated'>,
  email?: string | null,
): string | null {
  const fieldHome = fieldStaffPortalHomePath(email, role);
  if (fieldHome) return fieldHome;
  const portal = staffPortalIdForRole(role, profile);
  if (!portal) return null;
  return portalHomePath(portal);
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

/** Café front PWA routes on the back-office host (R-CAFE-AUTH-02). */
export function isCafeFrontPath(pathname: string): boolean {
  return (
    pathname === '/cafe-front' ||
    pathname.startsWith('/cafe-front/') ||
    pathname === '/login/cafe-front' ||
    pathname.startsWith('/login/cafe-front/')
  );
}

/** Shalom front caretaker portal on the back-office host. */
export function isShalomFrontPath(pathname: string): boolean {
  return (
    pathname === '/shalom-front' ||
    pathname.startsWith('/shalom-front/') ||
    pathname === '/login/shalom-front' ||
    pathname.startsWith('/login/shalom-front/')
  );
}

export function isFieldStaffPortalPath(pathname: string): boolean {
  return isCafeFrontPath(pathname) || isShalomFrontPath(pathname);
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
      if (pathname === '/settings' || pathname.startsWith('/settings/')) return true;
      if (isArCollectionsPath(pathname)) return true;
      return pathname === '/executive' || pathname.startsWith('/executive/');
    case 'om':
      return pathname === '/om' || pathname.startsWith('/om/');
    case 'tm':
      return pathname === '/tm' || pathname.startsWith('/tm/');
    case 'hq':
      if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return true;
      if (pathname === '/wfm' || pathname.startsWith('/wfm/')) return true;
      if (pathname === '/salon' || pathname.startsWith('/salon/')) return true;
      if (pathname === '/retail' || pathname.startsWith('/retail/')) return true;
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
  if (isCafeFrontPath(pathname)) return '/login/cafe-front';
  if (isShalomFrontPath(pathname)) return '/login/shalom-front';
  const portal = staffPortalForPath(pathname, search);
  if (portal) return loginPathForStaffPortal(portal);
  if (pathname.startsWith('/executive')) return PORTAL_LOGIN_PATHS.md;
  if (pathname.startsWith('/om')) return PORTAL_LOGIN_PATHS.om;
  if (pathname.startsWith('/tm')) return PORTAL_LOGIN_PATHS.tm;
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/wfm') ||
    pathname.startsWith('/salon') ||
    pathname.startsWith('/retail') ||
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

/** Whether this rank may authenticate on a staff portal sign-in page. */
export function canSignInAtStaffPortal(
  role: string | null | undefined,
  portal: StaffPortalId,
  profile?: Pick<BackOfficeUserProfile, 'rbacGated'>,
): boolean {
  if (portal === 'md') {
    return isExecutiveRank(role);
  }
  if (portal === 'hq' && isExecutiveRank(role)) {
    return true;
  }
  return roleMatchesStaffPortal(role, portal, profile);
}

export function staffPortalSignInError(portal: StaffPortalId): string {
  if (portal === 'md') {
    return 'MD Portal is for Managing Director and Operations Director only.';
  }
  return 'This account belongs to a different portal. Use the correct sign-in link for your role.';
}

function isExecutiveCrossPortalPath(pathname: string, search = ''): boolean {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return true;
  if (pathname === '/wfm' || pathname.startsWith('/wfm/')) return true;
  if (pathname === '/salon' || pathname.startsWith('/salon/')) return true;
  if (pathname === '/retail' || pathname.startsWith('/retail/')) return true;
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
  if (isArCollectionsPath(pathname)) {
    return canAccessArCollections(profile.role);
  }

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
