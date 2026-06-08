/** Hostname / URL helpers for multi-tenant Pearzen subdomains. Safe in client + server. */

import { CVS_TENANT_SLUG } from "./company-ids";

export const TENANT_SLUG_COOKIE = "pearzen_tenant_slug";
export const TENANT_SLUG_HEADER = "x-pearzen-tenant-slug";

export function tenantBaseDomain(): string {
  return process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? "pearzen.tech";
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

/** Production default when a platform host must route to the live tenant subdomain. */
export function defaultTenantSlugForPlatformHost(
  cookieSlug?: string | null,
): string {
  return (
    normalizeTenantSlug(cookieSlug) ??
    normalizeTenantSlug(process.env.NEXT_PUBLIC_DEV_TENANT_SLUG) ??
    CVS_TENANT_SLUG
  );
}

export function tenantSubdomainUrl(
  slug: string,
  pathname: string,
  search = "",
): string {
  const normalized = normalizeTenantSlug(slug) ?? CVS_TENANT_SLUG;
  const base = tenantBaseDomain();
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `https://${normalized}.${base}${path}${search}`;
}

/** Routes that must stay on forge / platform hosts (not tenant subdomains). */
export function isForgeOnlyPath(pathname: string): boolean {
  return (
    pathname === "/forge" ||
    pathname.startsWith("/forge/") ||
    pathname === "/login/forge" ||
    pathname.startsWith("/login/forge/")
  );
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

export type TenantSubPortalLink = {
  id: string;
  label: string;
  href: string;
  external?: boolean;
};

function buildTenantAppPathUrl(
  normalized: string,
  pathname: string,
  origin?: string,
): string {
  const base = tenantBaseDomain();
  const port = devBackOfficePort();
  const [path, rawQuery] = pathname.split("?");
  const params = new URLSearchParams(rawQuery ?? "");

  if (origin) {
    try {
      const { hostname, protocol } = new URL(origin);
      const useQueryBootstrap =
        isLocalDevHost(hostname) ||
        (!tenantSubdomainsLive() && isPlatformHost(hostname));

      if (useQueryBootstrap) {
        params.set("tenant", normalized);
        const query = params.toString();
        const fullPath = query ? `${path}?${query}` : path;

        if (isLocalDevHost(hostname) && devTenantUsesSubdomains()) {
          return `${protocol}//${normalized}.${base}:${port}${fullPath}`;
        }
        return `${origin.replace(/\/$/, "")}${fullPath}`;
      }
    } catch {
      /* fall through to subdomain URL */
    }
  }

  const query = params.toString();
  const fullPath = query ? `${path}?${query}` : path;
  return `https://${normalized}.${base}${fullPath}`;
}

/** Tenant-scoped back-office path (adds ?tenant= on platform/local hosts). */
export function tenantAppPathUrl(
  slug: string | null | undefined,
  pathname: string,
  origin?: string,
): string | null {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) return null;
  return buildTenantAppPathUrl(normalized, pathname, origin);
}

function defaultSmPwaOrigin(): string {
  if (process.env.NEXT_PUBLIC_SM_PWA_URL) {
    return process.env.NEXT_PUBLIC_SM_PWA_URL;
  }
  return process.env.NODE_ENV === "production"
    ? `https://sm.${tenantBaseDomain()}`
    : "http://127.0.0.1:3003";
}

function defaultFieldPwaOrigin(): string {
  if (process.env.NEXT_PUBLIC_FIELD_PWA_URL) {
    return process.env.NEXT_PUBLIC_FIELD_PWA_URL;
  }
  return process.env.NODE_ENV === "production"
    ? `https://field.${tenantBaseDomain()}`
    : "http://127.0.0.1:3001";
}

function defaultBackOfficeOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_BACK_OFFICE_URL ??
    `http://127.0.0.1:${devBackOfficePort()}`
  );
}

function externalPortalLoginUrl(
  base: string,
  pathname: string,
  slug?: string | null,
  origin?: string,
): string {
  const normalized = normalizeTenantSlug(slug);
  const root = base.replace(/\/$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (origin && normalized) {
    try {
      const { hostname } = new URL(origin);
      const useQueryBootstrap =
        isLocalDevHost(hostname) ||
        (!tenantSubdomainsLive() && isPlatformHost(hostname));
      if (useQueryBootstrap) {
        const params = new URLSearchParams();
        params.set("tenant", normalized);
        return `${root}${path}?${params.toString()}`;
      }
    } catch {
      /* use plain path */
    }
  }

  return `${root}${path}`;
}

export function smPortalLoginUrl(
  origin?: string,
  slug?: string | null,
): string {
  return externalPortalLoginUrl(
    defaultSmPwaOrigin(),
    "/login",
    slug,
    origin,
  );
}

export function guardPortalLoginUrl(
  origin?: string,
  slug?: string | null,
): string {
  return externalPortalLoginUrl(
    defaultFieldPwaOrigin(),
    "/login",
    slug,
    origin,
  );
}

export function cafeFrontPortalLoginUrl(
  origin?: string,
  slug?: string | null,
): string {
  const normalized = normalizeTenantSlug(slug);
  if (normalized && (origin || tenantSubdomainsLive())) {
    const tenantUrl = tenantAppPathUrl(normalized, "/login/cafe-front", origin);
    if (tenantUrl) return tenantUrl;
  }
  return externalPortalLoginUrl(
    defaultBackOfficeOrigin(),
    "/login/cafe-front",
    slug,
    origin,
  );
}

/** All tenant portal sign-in links shown in SaaS Forge tenant rows. */
export function tenantSubPortalLinks(
  slug: string | null | undefined,
  origin?: string,
): TenantSubPortalLink[] {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) return [];

  const pathUrl = (pathname: string) =>
    buildTenantAppPathUrl(normalized, pathname, origin);

  return [
    {
      id: "executive",
      label: "Executive Portal",
      href: pathUrl("/login/head-office?next=/executive/finance"),
    },
    {
      id: "hq",
      label: "HQ Portal",
      href: pathUrl("/login/head-office"),
    },
    {
      id: "om",
      label: "OM Portal",
      href: pathUrl("/login/om"),
    },
    {
      id: "tm",
      label: "TM Portal",
      href: pathUrl("/login/tm"),
    },
    {
      id: "sm",
      label: "SM Portal",
      href: smPortalLoginUrl(origin, normalized),
      external: true,
    },
    {
      id: "checkin",
      label: "Check-in Portal",
      href: guardPortalLoginUrl(origin, normalized),
      external: true,
    },
    {
      id: "cafe-front",
      label: "Café Front Office",
      href: pathUrl("/login/cafe-front"),
    },
  ];
}

/** Forge table → tenant Head Office sign-in URL. */
export function tenantPortalLoginUrl(
  slug: string | null | undefined,
  origin?: string,
): string | null {
  return tenantAppPathUrl(slug, "/login/head-office", origin);
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
