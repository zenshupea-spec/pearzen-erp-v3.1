import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  TENANT_SLUG_COOKIE,
  TENANT_SLUG_HEADER,
  defaultTenantSlugForPlatformHost,
  isForgeOnlyPath,
  isLocalDevHost,
  isTenantRedirectPlatformHost,
  normalizeTenantSlug,
  parseTenantSlugFromHostname,
  tenantSubdomainUrl,
} from "./lib/tenant-host";
import { isPublicCustomerMenuHost } from "./lib/customer-menu-host";
import {
  isSecurityWebsiteHost,
  isSecurityWebsitePublicPath,
} from "./lib/security-website-host";
import { CVS_TENANT_SLUG } from "./lib/company-ids";
import { canAccessPortalActivityLedger } from "./lib/audit-portals";
import { canAccessHqHub } from "./lib/hq-hub";
import {
  authenticatedLandingPath,
  canAccessPathForProfile,
  fetchBackOfficeUserProfile,
  portalPathForRole,
} from "./lib/hr-portal-access";
import {
  loginPathForRequestPath,
  loginPathForRole,
} from "./lib/portal-isolation";
import {
  cafeEmployeeEpfKey,
  getCafePortalAuthRecord,
  resolveCafeEmployeeForUser,
} from "./lib/cafe-front-auth";
import {
  clearPortalPinSessionCookies,
  hasValidHeadOfficeGeofenceSession,
  isPortalPinExemptPath,
  requiresHeadOfficePortalPin,
  resolvePortalAccessGate,
} from "./lib/head-office-portal-auth";
import { isHeadOfficeGeofenceExempt } from "./lib/head-office-geofence-exempt";
import { createSupabaseServiceClient } from "../../packages/supabase/service";

const AUTH_MATCHER = [
  "/",
  "/dashboard",
  "/dashboard/:path*",
  "/hq",
  "/hq/:path*",
  "/executive/:path*",
  "/cafe-front",
  "/cafe-front/:path*",
  "/om",
  "/om/:path*",
  "/tm/:path*",
  "/hr/:path*",
  "/fm/:path*",
  "/fm-dashboard/:path*",
  "/invoice-desk/:path*",
  "/account/:path*",
];

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  return xff.split(",")[0]?.trim() ?? null;
}

function matchesAuthProxy(pathname: string): boolean {
  return AUTH_MATCHER.some((pattern) => {
    if (pattern.endsWith(":path*")) {
      const base = pattern.slice(0, -":path*".length);
      return pathname === base.slice(0, -1) || pathname.startsWith(base);
    }
    return pathname === pattern;
  });
}

function isForgePath(pathname: string): boolean {
  return pathname === "/forge" || pathname.startsWith("/forge/");
}

function stampTenant(response: NextResponse, slug: string | null) {
  if (slug) {
    response.cookies.set(TENANT_SLUG_COOKIE, slug, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

function resolveTenantSlug(req: NextRequest): string | null {
  const hostname = req.headers.get("host")?.split(":")[0] ?? "";
  const pathname = req.nextUrl.pathname;

  const fromHost = parseTenantSlugFromHostname(hostname);
  if (fromHost) return fromHost;

  const fromCookie = normalizeTenantSlug(
    req.cookies.get(TENANT_SLUG_COOKIE)?.value,
  );
  if (fromCookie) return fromCookie;

  if (isLocalDevHost(hostname) && !isForgePath(pathname) && !pathname.startsWith("/login/forge")) {
    return normalizeTenantSlug(process.env.NEXT_PUBLIC_DEV_TENANT_SLUG);
  }

  return null;
}

function buildRequestWithTenant(req: NextRequest, tenantSlug: string | null) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  if (tenantSlug) {
    requestHeaders.set(TENANT_SLUG_HEADER, tenantSlug);
  } else {
    requestHeaders.delete(TENANT_SLUG_HEADER);
  }
  return requestHeaders;
}

function pathnameRequiresHeadOfficeGeofence(
  pathname: string,
): boolean {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
  if (pathname === "/executive" || pathname.startsWith("/executive/")) return true;
  if (pathname === "/om" || pathname.startsWith("/om/")) return true;
  if (pathname === "/tm" || pathname.startsWith("/tm/")) return true;
  if (pathname === "/hr" || pathname.startsWith("/hr/")) return true;
  if (pathname === "/fm" || pathname.startsWith("/fm/")) return true;
  if (pathname.startsWith("/hq/")) return true;
  if (pathname === "/invoice-desk" || pathname.startsWith("/invoice-desk/")) {
    return true;
  }
  return false;
}

async function enforceHeadOfficeGeofenceSession(
  req: NextRequest,
  profile: Awaited<ReturnType<typeof fetchBackOfficeUserProfile>>,
  userEmail: string,
  pathname: string,
): Promise<boolean> {
  if (isHeadOfficeGeofenceExempt(profile.role)) return true;
  if (!requiresHeadOfficePortalPin(profile, userEmail)) return true;
  if (!pathnameRequiresHeadOfficeGeofence(pathname)) return true;
  if (!profile.employeeId) return false;
  return hasValidHeadOfficeGeofenceSession(req, profile.employeeId, userEmail);
}

async function runAuthProxy(
  req: NextRequest,
  requestHeaders: Headers,
  tenantSlug: string | null,
) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host")?.split(":")[0] ?? "";

  const oauthCode = req.nextUrl.searchParams.get("code");
  if (oauthCode && pathname !== "/auth/callback") {
    const callbackUrl = new URL("/auth/callback", req.url);
    callbackUrl.searchParams.set("code", oauthCode);
    const next = req.nextUrl.searchParams.get("next") ?? "/";
    callbackUrl.searchParams.set("next", next);
    return stampTenant(NextResponse.redirect(callbackUrl), tenantSlug);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const loginPath = pathname.startsWith("/cafe-front")
      ? "/login/cafe-front"
      : loginPathForRequestPath(pathname, req.nextUrl.search);
    const loginUrl = new URL(loginPath, req.url);
    loginUrl.searchParams.set("error", "auth_unconfigured");
    return stampTenant(NextResponse.redirect(loginUrl), tenantSlug);
  }

  let cookiesToSet: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }> = [];

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies) {
        cookiesToSet = cookies as typeof cookiesToSet;
        cookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    if (pathname.startsWith("/login")) {
      return stampTenant(response, tenantSlug);
    }

    const loginPath = pathname.startsWith("/cafe-front")
      ? "/login/cafe-front"
      : loginPathForRequestPath(pathname, req.nextUrl.search);
    const loginUrl = new URL(loginPath, req.url);
    const returnPath = `${pathname}${req.nextUrl.search}`;
    if (returnPath.startsWith("/") && !returnPath.startsWith("//")) {
      loginUrl.searchParams.set("next", returnPath);
    }
    if (tenantSlug && !parseTenantSlugFromHostname(hostname)) {
      loginUrl.searchParams.set("tenant", tenantSlug);
    }

    return stampTenant(NextResponse.redirect(loginUrl), tenantSlug);
  }

  const user = userData.user;
  const profile = await fetchBackOfficeUserProfile(supabase, user, tenantSlug);
  const roleString = profile.role;
  const expectedPortal = portalPathForRole(roleString);
  const userLoginPath = loginPathForRole(roleString, profile);
  const search = req.nextUrl.search;

  const applyCookies = (redirectResponse: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options);
    });
    return stampTenant(redirectResponse, tenantSlug);
  };

  const portalGate = await resolvePortalAccessGate(
    req,
    profile,
    user.email,
    user.last_sign_in_at,
  );
  if (portalGate === "revoked" || portalGate === "not_provisioned") {
    await supabase.auth.signOut();
    const loginUrl = new URL(userLoginPath === "/login" ? "/login/hq" : userLoginPath, req.url);
    loginUrl.searchParams.set(
      "error",
      portalGate === "revoked" ? "access_revoked" : "not_provisioned",
    );
    const denied = applyCookies(NextResponse.redirect(loginUrl));
    clearPortalPinSessionCookies(denied);
    return denied;
  }

  if (
    portalGate === "verify_pin" &&
    pathname !== "/login/verify-pin" &&
    !isPortalPinExemptPath(pathname)
  ) {
    return applyCookies(
      NextResponse.redirect(new URL("/login/verify-pin", req.url)),
    );
  }

  if (portalGate === "set_pin" && pathname !== "/login/set-pin") {
    return applyCookies(
      NextResponse.redirect(new URL("/login/set-pin", req.url)),
    );
  }

  if (portalGate === "setup_2fa" && pathname !== "/login/setup-2fa") {
    return applyCookies(
      NextResponse.redirect(new URL("/login/setup-2fa", req.url)),
    );
  }

  if (portalGate === "verify_2fa" && pathname !== "/login/verify-2fa") {
    return applyCookies(
      NextResponse.redirect(new URL("/login/verify-2fa", req.url)),
    );
  }

  if (
    !(await enforceHeadOfficeGeofenceSession(
      req,
      profile,
      user.email ?? "",
      pathname,
    )) &&
    !isPortalPinExemptPath(pathname)
  ) {
    await supabase.auth.signOut();
    const loginUrl = new URL(userLoginPath === "/login" ? "/login/hq" : userLoginPath, req.url);
    loginUrl.searchParams.set("error", "geofence_denied");
    const denied = applyCookies(NextResponse.redirect(loginUrl));
    clearPortalPinSessionCookies(denied);
    return denied;
  }

  if (pathname === "/") {
    const landing = authenticatedLandingPath(roleString, profile);
    const target =
      landing === "/login" || landing.startsWith("/login/")
        ? `${userLoginPath}?error=no_portal_rank`
        : landing;
    return applyCookies(NextResponse.redirect(new URL(target, req.url)));
  }

  if (pathname === "/hq") {
    return applyCookies(NextResponse.redirect(new URL("/dashboard", req.url)));
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (!roleString) {
      return applyCookies(
        NextResponse.redirect(
          new URL("/login/hq?error=no_portal_rank", req.url),
        ),
      );
    }
    if (!canAccessHqHub(roleString) && !profile.rbacGated) {
      const fallback = authenticatedLandingPath(roleString, profile);
      if (fallback && !fallback.startsWith("/login")) {
        return applyCookies(NextResponse.redirect(new URL(fallback, req.url)));
      }
      return applyCookies(
        NextResponse.redirect(
          new URL(`${userLoginPath}?error=wrong_portal`, req.url),
        ),
      );
    }
    return stampTenant(response, tenantSlug);
  }

  if (pathname.startsWith("/hq/")) {
    if (pathname === "/hq/audit" || pathname.startsWith("/hq/audit/")) {
      if (!canAccessPortalActivityLedger(roleString)) {
        const fallback = authenticatedLandingPath(roleString, profile);
        return applyCookies(
          NextResponse.redirect(
            new URL(
              fallback.startsWith("/login") ? "/dashboard" : fallback,
              req.url,
            ),
          ),
        );
      }
      return stampTenant(response, tenantSlug);
    }

    if (!canAccessPathForProfile(pathname, profile, search)) {
      const fallback = authenticatedLandingPath(roleString, profile);
      return applyCookies(
        NextResponse.redirect(
          new URL(
            fallback.startsWith("/login") ? `${userLoginPath}?error=hq_denied` : fallback,
            req.url,
          ),
        ),
      );
    }
    return stampTenant(response, tenantSlug);
  }

  if (pathname === "/cafe-front" || pathname.startsWith("/cafe-front/")) {
    const cafeEmployee = await resolveCafeEmployeeForUser(user);
    if (!cafeEmployee) {
      const deniedUrl = new URL("/login/cafe-front", req.url);
      deniedUrl.searchParams.set("error", "cafe_denied");
      return applyCookies(NextResponse.redirect(deniedUrl));
    }

    const epf = cafeEmployeeEpfKey(cafeEmployee);
    const authRecord = epf
      ? await getCafePortalAuthRecord(createSupabaseServiceClient(), epf)
      : null;
    const needsPinSetup = authRecord?.needs_pin_setup ?? false;
    const onSetPin = pathname === "/cafe-front/set-pin";

    if (needsPinSetup && !onSetPin) {
      return applyCookies(
        NextResponse.redirect(new URL("/cafe-front/set-pin", req.url)),
      );
    }
    if (!needsPinSetup && onSetPin) {
      return applyCookies(NextResponse.redirect(new URL("/cafe-front", req.url)));
    }

    return stampTenant(response, tenantSlug);
  }

  if (pathname === "/executive" || pathname.startsWith("/executive/")) {
    if (!canAccessPathForProfile(pathname, profile, search)) {
      const deniedUrl = new URL(userLoginPath, req.url);
      deniedUrl.searchParams.set("error", "wrong_portal");
      if (roleString) deniedUrl.searchParams.set("role", roleString);
      return applyCookies(NextResponse.redirect(deniedUrl));
    }
    return stampTenant(response, tenantSlug);
  }

  if (
    pathname === "/om" ||
    pathname.startsWith("/om/") ||
    pathname === "/tm" ||
    pathname.startsWith("/tm/") ||
    pathname === "/hr" ||
    pathname.startsWith("/hr/") ||
    pathname === "/fm" ||
    pathname.startsWith("/fm/") ||
    pathname === "/fm-dashboard" ||
    pathname.startsWith("/fm-dashboard/") ||
    pathname === "/invoice-desk" ||
    pathname.startsWith("/invoice-desk/")
  ) {
    if (!canAccessPathForProfile(pathname, profile, search)) {
      const landing = authenticatedLandingPath(roleString, profile);
      const target = landing.startsWith("/login")
        ? `${userLoginPath}?error=wrong_portal`
        : landing;
      return applyCookies(NextResponse.redirect(new URL(target, req.url)));
    }

    return stampTenant(response, tenantSlug);
  }

  return stampTenant(response, tenantSlug);
}

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get("host")?.split(":")[0] ?? "";
  const { pathname, search } = req.nextUrl;

  // Staff choose their isolated portal at /login (MD · OM · TM · HQ).
  if (pathname === "/login/head-office") {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login/hq";
    redirectUrl.search = req.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  // forge.pearzen.tech is SaaS Forge only — tenant portals live on cvs.pearzen.tech.
  const host = hostname.toLowerCase();
  const isForgePlatformHost =
    host === "forge.pearzen.tech" ||
    host === "erp.pearzen.tech" ||
    host === "pearzen.tech" ||
    host === "www.pearzen.tech" ||
    isTenantRedirectPlatformHost(hostname);

  if (
    isForgePlatformHost &&
    !isForgeOnlyPath(pathname) &&
    !pathname.startsWith("/auth/") &&
    !pathname.startsWith("/api/")
  ) {
    const slug = defaultTenantSlugForPlatformHost(
      req.cookies.get(TENANT_SLUG_COOKIE)?.value,
    );
    return NextResponse.redirect(tenantSubdomainUrl(slug, pathname, search));
  }

  // Public security marketing site — classicventuresecurity.com: marketing pages + /clientlogin only.
  // Staff portals (/login, /hr, …) live on cvs.pearzen.tech — never expose them on this domain.
  if (isSecurityWebsiteHost(hostname)) {
    if (pathname === "/") {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/security-website";
      return stampTenant(NextResponse.redirect(redirectUrl), CVS_TENANT_SLUG);
    }
    if (isSecurityWebsitePublicPath(pathname)) {
      return stampTenant(
        NextResponse.next({ request: { headers: buildRequestWithTenant(req, CVS_TENANT_SLUG) } }),
        CVS_TENANT_SLUG,
      );
    }
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/security-website";
    redirectUrl.search = "";
    return stampTenant(NextResponse.redirect(redirectUrl), CVS_TENANT_SLUG);
  }

  // Public menu domain must never serve ERP / staff portals (misconfigured DNS guard).
  if (isPublicCustomerMenuHost(hostname)) {
    return NextResponse.json(
      {
        error: "public_menu_host_only",
        message:
          "This hostname is reserved for the public customer menu. Point tasha.lk at the customer menu app, not back-office.",
      },
      { status: 403 },
    );
  }

  const queryTenant = normalizeTenantSlug(req.nextUrl.searchParams.get("tenant"));
  if (queryTenant) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete("tenant");
    const redirect = NextResponse.redirect(clean);
    return stampTenant(redirect, queryTenant);
  }

  const tenantSlug = resolveTenantSlug(req);
  const requestHeaders = buildRequestWithTenant(req, tenantSlug);

  if (matchesAuthProxy(req.nextUrl.pathname)) {
    return runAuthProxy(req, requestHeaders, tenantSlug);
  }

  return stampTenant(
    NextResponse.next({ request: { headers: requestHeaders } }),
    tenantSlug,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
