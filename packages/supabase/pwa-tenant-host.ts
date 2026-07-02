/**
 * PWA hostname → tenant slug. No production default to CVS — local dev uses
 * NEXT_PUBLIC_DEV_TENANT_SLUG only.
 */

export function pwaTenantBaseDomain(): string {
  return (process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? 'pearzen.tech').toLowerCase();
}

export function isPwaLocalDevHost(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase();
  return host === '127.0.0.1' || host === 'localhost';
}

/** Local dev only — unset env returns null (no CVS fallback). */
export function devTenantSlugFromEnv(): string | null {
  const slug = process.env.NEXT_PUBLIC_DEV_TENANT_SLUG?.trim().toLowerCase();
  if (!slug) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) return null;
  return slug;
}

const CVS_LEGACY_CHECKIN_HOST = 'cv';

/** CVS back-office portal hosts — not Field/SM PWA tenant roots. */
const CVS_LEGACY_STAFF_PORTAL_SUBS = new Set([
  'cvshq',
  'cvsexec',
  'cvsom',
  'cvstm',
  'cvssm',
]);

const PWA_PORTAL_SUFFIXES = ['checkin', 'sm'] as const;

const BACK_OFFICE_PORTAL_SUFFIXES = ['exec', 'hq', 'om', 'tm'] as const;

/** Platform hosts — never tenant slugs for Field/SM PWAs. */
const RESERVED_PEARZEN_SUBDOMAINS = new Set([
  'forge',
  'erp',
  'superadmin',
  'www',
  'partners',
  'pears',
]);

function normalizeTenantSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!slug) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) return null;
  return slug;
}

function parsePearzenSubdomainTenantSlug(sub: string): string | null {
  if (!sub || sub.includes('.')) return null;
  if (RESERVED_PEARZEN_SUBDOMAINS.has(sub)) return null;

  if (sub === CVS_LEGACY_CHECKIN_HOST) return 'cvs';

  for (const suffix of PWA_PORTAL_SUFFIXES) {
    if (!sub.endsWith(suffix)) continue;
    const slugPart = sub.slice(0, -suffix.length);
    return normalizeTenantSlug(slugPart);
  }

  if (CVS_LEGACY_STAFF_PORTAL_SUBS.has(sub)) return null;

  for (const suffix of BACK_OFFICE_PORTAL_SUFFIXES) {
    if (sub.endsWith(suffix) && sub.length > suffix.length) return null;
  }

  return normalizeTenantSlug(sub);
}

/**
 * Resolve tenant slug from request host.
 * Production: hostname only. Local dev: requires NEXT_PUBLIC_DEV_TENANT_SLUG.
 */
export function resolvePwaTenantSlugFromHostname(hostname: string): string | null {
  const host = hostname.split(':')[0].toLowerCase();

  if (isPwaLocalDevHost(host)) {
    return devTenantSlugFromEnv();
  }

  const base = pwaTenantBaseDomain();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;

  const sub = host.slice(0, -suffix.length);
  return parsePearzenSubdomainTenantSlug(sub);
}

export function fieldPwaTenantResolutionError(): string {
  if (process.env.NODE_ENV === 'production') {
    return 'This check-in portal URL is not configured for a tenant. Use your company check-in link.';
  }
  return 'Set NEXT_PUBLIC_DEV_TENANT_SLUG in .env for local Field PWA development.';
}

export function smPwaTenantResolutionError(): string {
  if (process.env.NODE_ENV === 'production') {
    return 'This SM portal URL is not configured for a tenant. Use your company SM portal link.';
  }
  return 'Set NEXT_PUBLIC_DEV_TENANT_SLUG in .env for local SM PWA development.';
}
