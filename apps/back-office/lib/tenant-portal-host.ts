/** Dedicated portal hostnames — e.g. cvshq.pearzen.tech → CVS tenant HQ hub only. */

import type { StaffPortalId } from './portal-isolation';
import {
  isFieldStaffPortalPath,
  isTmSharedOmPath,
  loginPathForStaffPortal,
  pathBelongsToStaffPortal,
  portalHomePath,
} from './portal-isolation';
import { CVS_TENANT_SLUG } from './company-ids';
import { tenantBaseDomain } from './tenant-host';

export type TenantPortalHostBinding = {
  tenantSlug: string;
  portal: StaffPortalId;
  loginPath: string;
  homePath: string;
};

/** CVS dedicated production host prefix → portal role (back-office or external PWA). */
export type CvsDedicatedHostRole = StaffPortalId | 'sm' | 'checkin';

const CVS_DEDICATED_HOST_PREFIXES: Record<string, CvsDedicatedHostRole> = {
  cvshq: 'hq',
  cvsexec: 'md',
  cvsom: 'om',
  cvstm: 'tm',
  cvssm: 'sm',
  cv: 'checkin',
};

function buildBinding(
  tenantSlug: string,
  portal: StaffPortalId,
): TenantPortalHostBinding {
  return {
    tenantSlug,
    portal,
    loginPath: loginPathForStaffPortal(portal),
    homePath: portalHomePath(portal),
  };
}

/** Production portal hostnames for Classic Venture (slug `cvs`). */
export function cvsPortalProductionHosts() {
  const base = tenantBaseDomain();
  return {
    hq: `cvshq.${base}`,
    md: `cvsexec.${base}`,
    om: `cvsom.${base}`,
    tm: `cvstm.${base}`,
    sm: `cvssm.${base}`,
    checkin: `cv.${base}`,
  } as const;
}

/** Pearzen subdomain portal suffixes for any tenant slug (e.g. demo → demohq.pearzen.tech). */
const CONVENTIONAL_PORTAL_SUFFIXES: ReadonlyArray<{
  suffix: string;
  role: CvsDedicatedHostRole;
}> = [
  { suffix: 'checkin', role: 'checkin' },
  { suffix: 'exec', role: 'md' },
  { suffix: 'hq', role: 'hq' },
  { suffix: 'om', role: 'om' },
  { suffix: 'tm', role: 'tm' },
  { suffix: 'sm', role: 'sm' },
];

function normalizePortalSlugPart(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!slug) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) return null;
  return slug;
}

function parseHostnameSubdomain(hostname: string): string | null {
  const host = hostname.split(':')[0].toLowerCase();
  const base = tenantBaseDomain();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;

  const sub = host.slice(0, -suffix.length);
  if (!sub || sub.includes('.')) return null;
  return sub;
}

/**
 * Resolve `{slug}{portal}.{base}` hosts for new tenants (e.g. demohq → demo / HQ).
 * CVS legacy hosts (`cv`, cvshq, …) are handled by {@link parseCvsDedicatedHost}.
 */
export function parseConventionalTenantPortalHost(hostname: string): {
  tenantSlug: string;
  role: CvsDedicatedHostRole;
} | null {
  const sub = parseHostnameSubdomain(hostname);
  if (!sub) return null;

  // Explicit CVS map wins for production legacy names (including `cv` check-in).
  if (CVS_DEDICATED_HOST_PREFIXES[sub]) return null;

  for (const { suffix, role } of CONVENTIONAL_PORTAL_SUFFIXES) {
    if (!sub.endsWith(suffix)) continue;
    const slugPart = sub.slice(0, -suffix.length);
    const tenantSlug = normalizePortalSlugPart(slugPart);
    if (!tenantSlug) continue;
    return { tenantSlug, role };
  }

  return null;
}

/** CVS legacy map first, then conventional `{slug}{portal}` for new tenants. */
export function parseDedicatedPortalHost(hostname: string): {
  tenantSlug: string;
  role: CvsDedicatedHostRole;
} | null {
  return parseCvsDedicatedHost(hostname) ?? parseConventionalTenantPortalHost(hostname);
}

/** Production portal hostnames for any tenant slug using Pearzen conventions. */
export function conventionalTenantPortalProductionHosts(slug: string) {
  const normalized = normalizePortalSlugPart(slug);
  if (!normalized) {
    throw new Error('Invalid tenant slug for portal hostnames.');
  }
  const base = tenantBaseDomain();
  return {
    hq: `${normalized}hq.${base}`,
    md: `${normalized}exec.${base}`,
    om: `${normalized}om.${base}`,
    tm: `${normalized}tm.${base}`,
    sm: `${normalized}sm.${base}`,
    checkin: `${normalized}checkin.${base}`,
  } as const;
}

/**
 * Resolve any CVS dedicated hostname (back-office or PWA) to tenant slug `cvs`.
 * Returns null for non-CVS hosts (e.g. `acme.pearzen.tech`).
 */
export function parseCvsDedicatedHost(hostname: string): {
  tenantSlug: string;
  role: CvsDedicatedHostRole;
} | null {
  const host = hostname.split(':')[0].toLowerCase();
  const base = tenantBaseDomain();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;

  const sub = host.slice(0, -suffix.length);
  const role = CVS_DEDICATED_HOST_PREFIXES[sub];
  if (!role) return null;

  return { tenantSlug: CVS_TENANT_SLUG, role };
}

/** Back-office dedicated hosts (cvshq, demohq, cvsexec, demoexec, cvsom, demoom, cvstm, demotm). */
export function parseTenantPortalHost(hostname: string): TenantPortalHostBinding | null {
  const dedicated = parseDedicatedPortalHost(hostname);
  if (!dedicated) return null;
  if (dedicated.role === 'sm' || dedicated.role === 'checkin') return null;
  return buildBinding(dedicated.tenantSlug, dedicated.role);
}

export function isCvsDedicatedTenantHost(hostname: string): boolean {
  return parseCvsDedicatedHost(hostname) !== null;
}

export function isDedicatedTenantPortalHost(hostname: string): boolean {
  return parseDedicatedPortalHost(hostname) !== null;
}

export function isTenantPortalHost(hostname: string): boolean {
  return parseTenantPortalHost(hostname) !== null;
}

const AUTH_FLOW_LOGIN_PREFIXES = [
  '/login/cafe-front',
  '/login/shalom-front',
  '/login/verify-pin',
  '/login/set-pin',
  '/login/setup-2fa',
  '/login/verify-2fa',
  '/login/recover-2fa',
  '/login/set-unlock-code',
  '/login/reset-unlock-code',
  '/login/await-session',
] as const;

export function isTenantPortalAuthFlowPath(pathname: string): boolean {
  return AUTH_FLOW_LOGIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Platform-only paths blocked on dedicated tenant portal hosts (middleware contract). */
export function tenantPortalPlatformPathRedirect(
  pathname: string,
  binding: TenantPortalHostBinding,
): string | null {
  if (
    pathname.startsWith('/forge') ||
    pathname.startsWith('/pearzen-website') ||
    pathname === '/clientlogin' ||
    pathname.startsWith('/clientlogin/')
  ) {
    return binding.homePath;
  }
  return null;
}

export function pathAllowedOnTenantPortalHost(
  pathname: string,
  search: string,
  binding: TenantPortalHostBinding,
): boolean {
  if (pathname === binding.loginPath || pathname.startsWith(`${binding.loginPath}/`)) {
    return true;
  }
  if (isTenantPortalAuthFlowPath(pathname)) return true;
  if (binding.portal === 'hq' && isFieldStaffPortalPath(pathname)) {
    return true;
  }
  if (pathname === '/account/security' || pathname.startsWith('/account/security/')) {
    return true;
  }
  if (
    (binding.portal === 'hq' || binding.portal === 'md') &&
    (pathname === '/security-website' || pathname.startsWith('/security-website/'))
  ) {
    return true;
  }
  if (binding.portal === 'tm' && isTmSharedOmPath(pathname)) {
    return true;
  }
  return pathBelongsToStaffPortal(pathname, binding.portal, search);
}
