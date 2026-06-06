/** Hostname / URL helpers for multi-tenant Pearzen subdomains. Safe in client + server. */

export const TENANT_SLUG_COOKIE = "pearzen_tenant_slug";
export const TENANT_SLUG_HEADER = "x-pearzen-tenant-slug";

export function tenantBaseDomain(): string {
  return process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? "pearzen.com";
}

export function devBackOfficePort(): string {
  return process.env.NEXT_PUBLIC_BACK_OFFICE_PORT ?? "3002";
}

/** When true, local forge links use `{slug}.pearzen.com:3002` (requires /etc/hosts). */
export function devTenantUsesSubdomains(): boolean {
  return process.env.NEXT_PUBLIC_DEV_TENANT_SUBDOMAINS === "true";
}

/** Set true once `*.pearzen.com` DNS points at back-office (production subdomains live). */
export function tenantSubdomainsLive(): boolean {
  return process.env.NEXT_PUBLIC_TENANT_SUBDOMAINS_LIVE === "true";
}

export function normalizeTenantSlug(
  raw: string | null | undefined,
): string | null {
  const slug = raw?.trim().toLowerCase();
  if (!slug) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) return null;
  return slug;
}

export function isLocalDevHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

export function isPlatformHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  if (isLocalDevHost(host)) return true;

  const base = tenantBaseDomain();
  const forgeHost = process.env.NEXT_PUBLIC_FORGE_HOST?.toLowerCase();
  const platform = new Set(
    [
      base,
      `www.${base}`,
      `erp.${base}`,
      `forge.${base}`,
      forgeHost,
      ...(process.env.NEXT_PUBLIC_PLATFORM_HOSTS ?? "")
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ].filter(Boolean),
  );
  if (platform.has(host)) return true;

  // Vercel deploy host until *.pearzen.com DNS is live
  if (host.endsWith(".vercel.app")) return true;

  return false;
}

/** `{slug}.pearzen.com` → slug; platform hosts → null. */
export function parseTenantSlugFromHostname(hostname: string): string | null {
  const host = hostname.split(":")[0].toLowerCase();
  if (isPlatformHost(host)) return null;

  const base = tenantBaseDomain();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;

  const sub = host.slice(0, -suffix.length);
  if (!sub || sub.includes(".")) return null;
  return normalizeTenantSlug(sub);
}

/** Forge table → tenant Head Office sign-in URL. */
export function tenantPortalLoginUrl(
  slug: string | null | undefined,
  origin?: string,
): string | null {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) return null;

  const base = tenantBaseDomain();
  const port = devBackOfficePort();

  if (origin) {
    try {
      const { hostname, protocol } = new URL(origin);
      const useQueryBootstrap =
        isLocalDevHost(hostname) ||
        (!tenantSubdomainsLive() && isPlatformHost(hostname));

      if (useQueryBootstrap) {
        if (isLocalDevHost(hostname) && devTenantUsesSubdomains()) {
          return `${protocol}//${normalized}.${base}:${port}/login/head-office`;
        }
        return `${origin.replace(/\/$/, "")}/login/head-office?tenant=${normalized}`;
      }
    } catch {
      /* fall through to subdomain URL */
    }
  }

  return `https://${normalized}.${base}/login/head-office`;
}

export function tenantProductionDomain(
  slug: string | null | undefined,
): string | null {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) return null;
  return `${normalized}.${tenantBaseDomain()}`;
}

export function tenantProductionPortalUrl(
  slug: string | null | undefined,
): string | null {
  const domain = tenantProductionDomain(slug);
  if (!domain) return null;
  return `https://${domain}/login/head-office`;
}
