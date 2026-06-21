/** SaaS Forge / Super Admin hostname helpers. Safe in client + server. */

import { tenantBaseDomain } from './tenant-host';

/** Canonical production host — defaults to forge.{base} until DNS alias is live. */
export function canonicalForgeHost(): string {
  return (
    process.env.NEXT_PUBLIC_FORGE_HOST?.trim().toLowerCase() ||
    `forge.${tenantBaseDomain()}`
  );
}

export function legacyForgeHost(): string {
  return `forge.${tenantBaseDomain()}`;
}

export function superAdminForgeHost(): string {
  return `superadmin.${tenantBaseDomain()}`;
}

/** All hostnames that serve only SaaS Forge (not tenant ERP). */
export function dedicatedForgeHosts(): string[] {
  const base = tenantBaseDomain();
  const extra = (process.env.NEXT_PUBLIC_FORGE_LEGACY_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(
    new Set(
      [
        canonicalForgeHost(),
        legacyForgeHost(),
        superAdminForgeHost(),
        ...extra,
      ].filter(Boolean),
    ),
  );
}

export function normalizeHostname(hostname: string): string {
  return hostname.split(':')[0].toLowerCase();
}

export function isDedicatedForgeHost(hostname: string): boolean {
  return dedicatedForgeHosts().includes(normalizeHostname(hostname));
}

/**
 * When canonical host is superadmin.*, redirect legacy forge.* to the canonical host.
 * Returns the canonical hostname or null if no redirect is needed.
 */
export function legacyForgeRedirectHost(hostname: string): string | null {
  const host = normalizeHostname(hostname);
  const canonical = canonicalForgeHost();
  if (host === legacyForgeHost() && canonical !== legacyForgeHost()) {
    return canonical;
  }
  return null;
}

export function forgeLoginUrl(): string {
  return `https://${canonicalForgeHost()}/login/forge`;
}
