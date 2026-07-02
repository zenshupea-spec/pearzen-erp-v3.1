/** Hostname / URL helpers for multi-tenant Pearzen subdomains. Safe in client + server. */

import { CVS_TENANT_SLUG } from "./company-ids";
import { supabaseAuthCookieSecure } from "../../../packages/supabase/cookie-options";
import { dedicatedForgeHosts, isDedicatedForgeHost } from "./forge-host";
import { isShalomPublicHost } from "./shalom-public-host";
import {
  cvsPortalProductionHosts,
  parseDedicatedPortalHost,
  parseTenantPortalHost,
} from "./tenant-portal-host";

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

/** Shared tenant slug resolution — mirrors middleware `resolveTenantSlug` priority. */
export function resolveTenantSlugFromHostAndCookie(
  hostname: string,
  cookieValue?: string | null,
  options?: { allowDevFallback?: boolean },
): string | null {
  const host = hostname.split(":")[0].toLowerCase();

  const portalBinding = parseTenantPortalHost(host);
  if (portalBinding) return portalBinding.tenantSlug;

  const fromHost = parseTenantSlugFromHostname(host);
  if (fromHost) return fromHost;

  // SaaS Forge hosts never inherit tenant ERP scope from cookies.
  if (isDedicatedForgeHost(host)) return null;

  const fromCookie = normalizeTenantSlug(cookieValue);
  if (fromCookie) return fromCookie;

  const allowDevFallback = options?.allowDevFallback ?? true;
  if (allowDevFallback && isLocalDevHost(host)) {
    return normalizeTenantSlug(process.env.NEXT_PUBLIC_DEV_TENANT_SLUG);
  }

  return null;
}

export function applyTenantSlugCookie(
  response: {
    cookies: {
      set: (
        name: string,
        value: string,
        options?: { path?: string; sameSite?: "lax" | "strict" | "none"; maxAge?: number },
      ) => void;
    };
  },
  slug: string | null | undefined,
): void {
  const normalized = normalizeTenantSlug(slug ?? null);
  if (!normalized) return;
  response.cookies.set(TENANT_SLUG_COOKIE, normalized, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    secure: supabaseAuthCookieSecure(),
  });
}

/** Drop tenant ERP scope cookie — used when entering SaaS Forge on a dedicated host. */
export function clearTenantSlugCookie(response: {
  cookies: {
    set: (
      name: string,
      value: string,
      options?: { path?: string; sameSite?: "lax" | "strict" | "none"; maxAge?: number },
    ) => void;
  };
}): void {
  response.cookies.set(TENANT_SLUG_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: supabaseAuthCookieSecure(),
  });
}

export function isLocalDevHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

export function isPlatformHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  if (isLocalDevHost(host)) return true;

  const base = tenantBaseDomain();
  const platform = new Set(
    [
      base,
      `www.${base}`,
      `erp.${base}`,
      ...dedicatedForgeHosts(),
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

/** Vercel preview deploy host — must not inherit CVS tenant without an explicit cookie. */
export function isVercelDeployHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  return host.endsWith(".vercel.app");
}

/**
 * Slug for `erp.{base}` redirect to `{slug}.{base}`.
 * Preview `*.vercel.app` hosts never default to CVS — cookie required (R-INFRA-02).
 * Production `erp.{base}` uses FORGE_DEFAULT_REDIRECT_SLUG when set; otherwise null (tenant picker).
 */
export function platformDefaultRedirectSlug(): string | null {
  return normalizeTenantSlug(
    process.env.FORGE_DEFAULT_REDIRECT_SLUG ??
      process.env.NEXT_PUBLIC_FORGE_DEFAULT_REDIRECT_SLUG,
  );
}

export function defaultTenantSlugForPlatformHost(
  cookieSlug?: string | null,
  hostname?: string | null,
): string | null {
  const fromCookie = normalizeTenantSlug(cookieSlug);
  if (fromCookie) return fromCookie;

  const host = hostname?.split(":")[0].toLowerCase() ?? "";
  if (host && isVercelDeployHost(host)) return null;

  if (host && isLocalDevHost(host)) {
    return normalizeTenantSlug(process.env.NEXT_PUBLIC_DEV_TENANT_SLUG);
  }

  if (host && isTenantRedirectPlatformHost(host)) {
    return platformDefaultRedirectSlug();
  }

  return null;
}

export function tenantSubdomainUrl(
  slug: string,
  pathname: string,
  search = "",
): string {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) {
    throw new Error(`Invalid tenant slug for subdomain URL: ${slug}`);
  }
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
    pathname.startsWith("/login/forge/") ||
    pathname === "/login/partners" ||
    pathname === "/partners" ||
    pathname.startsWith("/partners/") ||
    pathname === "/pearzen-website" ||
    pathname.startsWith("/pearzen-website/")
  );
}

/** Redirect tenant ERP paths away from dedicated Forge hosts (middleware contract). */
export function dedicatedForgeHostErpRedirectPath(pathname: string): string | null {
  if (isForgeOnlyPath(pathname)) return null;
  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) return null;
  return pathname.startsWith("/login") ? "/login/forge" : "/forge";
}

/**
 * Hostnames that must never serve tenant staff portals — only SaaS Forge.
 * Tenant routes on these hosts redirect to `{slug}.pearzen.tech`.
 */
export function isTenantRedirectPlatformHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  if (isLocalDevHost(host) || host.endsWith(".vercel.app")) return false;

  const base = tenantBaseDomain();
  const redirectHosts = new Set([`erp.${base}`]);
  return redirectHosts.has(host);
}

/** `{slug}.pearzen.com` → slug; CVS dedicated hosts → `cvs`; platform hosts → null. */
export function parseTenantSlugFromHostname(hostname: string): string | null {
  const host = hostname.split(":")[0].toLowerCase();

  if (isShalomPublicHost(host)) return null;

  const dedicated = parseDedicatedPortalHost(host);
  if (dedicated) return dedicated.tenantSlug;

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

export function guardPortalUrl(
  origin?: string,
  slug?: string | null,
): string {
  return externalPortalLoginUrl(
    defaultFieldPwaOrigin(),
    "/",
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

export function shalomFrontPortalLoginUrl(
  origin?: string,
  slug?: string | null,
): string {
  const normalized = normalizeTenantSlug(slug);
  if (normalized && (origin || tenantSubdomainsLive())) {
    const tenantUrl = tenantAppPathUrl(normalized, "/login/shalom-front", origin);
    if (tenantUrl) return tenantUrl;
  }
  return externalPortalLoginUrl(
    defaultBackOfficeOrigin(),
    "/login/shalom-front",
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

  const dedicatedBackOfficeLogin = (
    portal: "hq" | "md" | "om" | "tm",
    pathname: string,
  ) => {
    if (normalized !== CVS_TENANT_SLUG || !tenantSubdomainsLive()) {
      return pathUrl(pathname);
    }
    const hosts = cvsPortalProductionHosts();
    return `https://${hosts[portal]}${pathname}`;
  };

  const dedicatedExternalLogin = (portal: "sm" | "checkin") => {
    if (normalized !== CVS_TENANT_SLUG || !tenantSubdomainsLive()) {
      return portal === "sm"
        ? smPortalLoginUrl(origin, normalized)
        : guardPortalLoginUrl(origin, normalized);
    }
    const hosts = cvsPortalProductionHosts();
    return `https://${hosts[portal]}/login`;
  };

  return [
    {
      id: "md",
      label: "MD Portal",
      href: dedicatedBackOfficeLogin("md", "/login/md"),
    },
    {
      id: "hq",
      label: "HQ Staff Portal",
      href: dedicatedBackOfficeLogin("hq", "/login/hq"),
    },
    {
      id: "om",
      label: "OM Portal",
      href: dedicatedBackOfficeLogin("om", "/login/om"),
    },
    {
      id: "tm",
      label: "TM Portal",
      href: dedicatedBackOfficeLogin("tm", "/login/tm"),
    },
    {
      id: "sm",
      label: "SM Portal",
      href: dedicatedExternalLogin("sm"),
      external: true,
    },
    {
      id: "checkin",
      label: "Check-in Portal",
      href: dedicatedExternalLogin("checkin"),
      external: true,
    },
    {
      id: "cafe-front",
      label: "Café Front Office",
      href: dedicatedBackOfficeLogin("hq", "/login/cafe-front"),
    },
    {
      id: "shalom-front",
      label: "Shalom Front Office",
      href: dedicatedBackOfficeLogin("hq", "/login/shalom-front"),
    },
  ];
}

/** Forge table → tenant Head Office sign-in URL. */
export function tenantPortalLoginUrl(
  slug: string | null | undefined,
  origin?: string,
): string | null {
  return tenantAppPathUrl(slug, "/login", origin);
}

export function tenantProductionDomain(
  slug: string | null | undefined,
): string | null {
  const normalized = normalizeTenantSlug(slug);
  if (!normalized) return null;
  if (normalized === CVS_TENANT_SLUG && tenantSubdomainsLive()) {
    return cvsPortalProductionHosts().hq;
  }
  return `${normalized}.${tenantBaseDomain()}`;
}

export function tenantProductionPortalUrl(
  slug: string | null | undefined,
): string | null {
  const domain = tenantProductionDomain(slug);
  if (!domain) return null;
  return `https://${domain}/login`;
}
