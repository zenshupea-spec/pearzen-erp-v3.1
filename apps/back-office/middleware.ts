import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  TENANT_SLUG_COOKIE,
  TENANT_SLUG_HEADER,
  isLocalDevHost,
  normalizeTenantSlug,
  parseTenantSlugFromHostname,
} from "./lib/tenant-host";
import { isPublicCustomerMenuHost } from "./lib/customer-menu-host";
import { canAccessHqHub } from "./lib/hq-hub";
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
  portalPathForRole,
} from "./lib/hr-portal-access";
import { resolveCafeEmployeeForUser } from "./lib/cafe-front-auth";
import { verifyOfficeLocation } from "./utils/geofence";

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
  if (tenantSlug) {
    requestHeaders.set(TENANT_SLUG_HEADER, tenantSlug);
  } else {
    requestHeaders.delete(TENANT_SLUG_HEADER);
  }
  return requestHeaders;
}

async function runAuthProxy(
  req: NextRequest,
  requestHeaders: Headers,
  tenantSlug: string | null,
) {
  const { pathname } = req.nextUrl;

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
      : "/login/head-office";
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
      : "/login/head-office";
    const loginUrl = new URL(loginPath, req.url);
    const returnPath = `${pathname}${req.nextUrl.search}`;
    if (returnPath.startsWith("/") && !returnPath.startsWith("//")) {
      loginUrl.searchParams.set("next", returnPath);
    }
    if (tenantSlug) {
      loginUrl.searchParams.set("tenant", tenantSlug);
    }

    return stampTenant(NextResponse.redirect(loginUrl), tenantSlug);
  }

  const user = userData.user;
  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const roleString = profile.role;
  const expectedPortal = portalPathForRole(roleString);
  const isGodMode = roleString === "MD" || roleString === "OD";

  const applyCookies = (redirectResponse: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) => {
      redirectResponse.cookies.set(name, value, options);
    });
    return stampTenant(redirectResponse, tenantSlug);
  };

  if (pathname === "/") {
    const landing = authenticatedLandingPath(roleString);
    const target =
      landing === "/login/head-office"
        ? "/login/head-office?error=no_portal_rank"
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
          new URL("/login/head-office?error=no_portal_rank", req.url),
        ),
      );
    }
    if (!canAccessHqHub(roleString)) {
      const fallback =
        expectedPortal ??
        (authenticatedLandingPath(roleString) !== "/login/head-office"
          ? authenticatedLandingPath(roleString)
          : null);
      if (fallback) {
        return applyCookies(NextResponse.redirect(new URL(fallback, req.url)));
      }
      return applyCookies(
        NextResponse.redirect(
          new URL("/login/head-office?error=no_portal_rank", req.url),
        ),
      );
    }
    return stampTenant(response, tenantSlug);
  }

  if (pathname.startsWith("/hq/")) {
    const hqAllowed = isGodMode || roleString === "HR" || roleString === "FM";
    if (!hqAllowed) {
      if (expectedPortal) {
        return applyCookies(
          NextResponse.redirect(new URL(expectedPortal, req.url)),
        );
      }
      return applyCookies(
        NextResponse.redirect(
          new URL("/login/head-office?error=no_portal_rank", req.url),
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
    return stampTenant(response, tenantSlug);
  }

  if (pathname === "/executive" || pathname.startsWith("/executive/")) {
    const isExecutive = roleString === "MD" || roleString === "OD";
    const isCafeBackoffice =
      pathname === "/executive/cafe" || pathname.startsWith("/executive/cafe/");
    if (!isExecutive) {
      const cafeAllowed =
        isCafeBackoffice && (roleString === "HR" || roleString === "FM");
      if (!cafeAllowed) {
        const deniedUrl = new URL("/login/head-office", req.url);
        deniedUrl.searchParams.set("error", "executive_denied");
        if (roleString) {
          deniedUrl.searchParams.set("role", roleString);
        }
        return applyCookies(NextResponse.redirect(deniedUrl));
      }
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
    if (isGodMode) {
      return stampTenant(response, tenantSlug);
    }

    const tmSharedOmPath =
      roleString === "TM" &&
      (pathname === "/om/sites/location" ||
        pathname.startsWith("/om/sites/location/") ||
        pathname === "/om/guard-cards" ||
        pathname.startsWith("/om/guard-cards/"));

    const inOwnPortal =
      expectedPortal &&
      (pathname === expectedPortal ||
        pathname.startsWith(`${expectedPortal}/`) ||
        tmSharedOmPath);

    if (!expectedPortal || !inOwnPortal) {
      if (expectedPortal) {
        return applyCookies(
          NextResponse.redirect(new URL(expectedPortal, req.url)),
        );
      }
      return applyCookies(
        NextResponse.redirect(
          new URL("/login/head-office?error=no_portal_rank", req.url),
        ),
      );
    }

    if (
      expectedPortal === "/om" ||
      expectedPortal === "/hr" ||
      expectedPortal === "/fm"
    ) {
      const ip = getClientIp(req);
      const latHeader = req.headers.get("x-user-lat");
      const lngHeader = req.headers.get("x-user-lng");
      const lat = latHeader ? Number.parseFloat(latHeader) : undefined;
      const lng = lngHeader ? Number.parseFloat(lngHeader) : undefined;

      const allowed = verifyOfficeLocation(ip, {
        lat: Number.isFinite(lat as number) ? (lat as number) : undefined,
        lng: Number.isFinite(lng as number) ? (lng as number) : undefined,
        role: roleString,
      });

      if (!allowed) {
        return applyCookies(
          NextResponse.redirect(
            new URL("/login/head-office?error=geofence_denied", req.url),
          ),
        );
      }
    }

    return stampTenant(response, tenantSlug);
  }

  return stampTenant(response, tenantSlug);
}

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get("host")?.split(":")[0] ?? "";

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
