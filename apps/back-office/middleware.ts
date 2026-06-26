import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { replaySupabaseAuthCookiesOnResponse } from "../../packages/supabase/auth-cookie-handlers";
import {
  normalizeSupabaseAuthCookieBatch,
  supabaseServerAuthCookieOptions,
  type SupabaseAuthCookie,
} from "../../packages/supabase/cookie-options";

import {
  TENANT_SLUG_COOKIE,
  TENANT_SLUG_HEADER,
  applyTenantSlugCookie,
  clearTenantSlugCookie,
  defaultTenantSlugForPlatformHost,
  dedicatedForgeHostErpRedirectPath,
  isForgeOnlyPath,
  isLocalDevHost,
  isTenantRedirectPlatformHost,
  normalizeTenantSlug,
  parseTenantSlugFromHostname,
  resolveTenantSlugFromHostAndCookie,
  tenantBaseDomain,
  tenantSubdomainUrl,
} from "./lib/tenant-host";
import { isPublicCustomerMenuHost, normalizeCustomerMenuUrl } from "./lib/customer-menu-host";
import {
  isSecurityWebsiteHost,
  isSecurityWebsitePublicPath,
} from "./lib/security-website-host";
import {
  isPearzenWebsiteHost,
  isPearzenWebsitePublicPath,
} from "./lib/pearzen-website-host";
import {
  isShalomPublicHost,
  shalomPublicInternalPath,
} from "./lib/shalom-public-host";
import {
  isTenantPortalAuthFlowPath,
  parseTenantPortalHost,
  pathAllowedOnTenantPortalHost,
  tenantPortalPlatformPathRedirect,
} from "./lib/tenant-portal-host";
import { CVS_TENANT_SLUG } from "./lib/company-ids";
import { canAccessHqAuditRoute } from "./lib/audit-ledger-access";
import { canAccessHqHub, WFM_HUB_PATH } from "./lib/hq-hub";
import {
  authenticatedLandingPath,
  canAccessPathForProfile,
  fetchBackOfficeUserProfile,
} from "./lib/hr-portal-access";
import {
  loginPathForRequestPath,
  loginPathForRole,
  resolveFieldStaffBoundaryRedirect,
} from "./lib/portal-isolation";
import {
  cafeEmployeeEpfKey,
  getCafePortalAuthRecord,
  resolveCafeEmployeeForUser,
} from "./lib/cafe-front-auth";
import {
  getShalomPortalAuthRecord,
  resolveShalomEmployeeForUser,
  shalomEmployeeEpfKey,
} from "./lib/shalom-front-auth";
import {
  clearPortalPinSessionCookies,
  hasValidHeadOfficeGeofenceSession,
  isPortalPinExemptPath,
  requiresHeadOfficePortalPin,
  resolvePortalAccessGate,
} from "./lib/head-office-portal-auth";
import { isHeadOfficeGeofenceExempt } from "./lib/head-office-geofence-exempt";
import { isDedicatedPartnerHost, isPartnerRoute } from "./lib/partner-host";
import { isDedicatedPearsHost, isPearsRoute } from "./lib/pears-host";
import { runPartnerAuthGate } from "./lib/partner-portal-middleware";
import { runPearsAuthGate } from "./lib/pears-portal-middleware";
import {
  isDedicatedForgeHost,
  legacyForgeRedirectHost,
  normalizeHostname,
} from "./lib/forge-host";
import { runForgeAuthGate } from "./lib/forge-portal-middleware";
import {
  DEPLOYMENT_MODE_NOT_FOUND,
  deploymentModeRouteRedirect,
} from "./lib/deployment-route-guard";
import { recordPortalLoginEvent } from "./lib/portal-login-events";
import {
  buildDailySignoutRedirectPath,
  isSignInBeforeLatestColomboMidnight,
} from "./lib/portal-sl-midnight";
import { resolveTenantCompany } from "./lib/tenant-context";
import {
  customDomainRoutesTraffic,
  lookupTenantCustomDomain,
  type TenantCustomDomainBinding,
} from "./lib/tenant-custom-domain-server";
import { createSupabaseServiceClient } from "../../packages/supabase/service";
import {
  fetchTenantModuleContextForSlug,
} from "./lib/tenant-product-bundle-server";
import {
  hubPathForBundle,
  isTenantPathAllowedForBundle,
  landingPathForRoleAndBundle,
} from "./lib/tenant-product-bundle";
import {
  canAccessSalonDesk,
  isSalonVerticalEnabled,
} from "./lib/salon-vertical-server";
import {
  canAccessRetailDesk,
  isRetailVerticalEnabled,
} from "./lib/retail-vertical-server";

const AUTH_MATCHER = [
  "/",
  "/dashboard",
  "/dashboard/:path*",
  "/wfm",
  "/wfm/:path*",
  "/salon",
  "/salon/:path*",
  "/retail",
  "/retail/:path*",
  "/hq",
  "/hq/:path*",
  "/executive",
  "/executive/:path*",
  "/cafe-front",
  "/cafe-front/:path*",
  "/shalom-front",
  "/shalom-front/:path*",
  "/om",
  "/om/:path*",
  "/tm/:path*",
  "/hr/:path*",
  "/fm/:path*",
  "/fm-dashboard/:path*",
  "/invoice-desk/:path*",
  "/ar-collections",
  "/ar-collections/:path*",
  "/account/:path*",
  "/settings",
  "/settings/:path*",
  "/login/md",
  "/login/om",
  "/login/tm",
  "/login/hq",
  "/login/head-office",
  "/login/verify-pin",
  "/login/set-pin",
  "/login/setup-2fa",
  "/login/verify-2fa",
  "/login/recover-2fa",
  "/login/set-unlock-code",
  "/login/reset-unlock-code",
  "/login/await-session",
  "/login/shalom-front",
  "/login/shalom-front/:path*",
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
  applyTenantSlugCookie(response, slug);
  return response;
}

function resolveTenantSlug(req: NextRequest): string | null {
  const hostname = req.headers.get("host") ?? "";
  const pathname = req.nextUrl.pathname;
  const host = hostname.split(":")[0];
  const allowDevFallback =
    isLocalDevHost(host) &&
    !isForgePath(pathname) &&
    !pathname.startsWith("/login/forge");

  return resolveTenantSlugFromHostAndCookie(
    hostname,
    req.cookies.get(TENANT_SLUG_COOKIE)?.value,
    { allowDevFallback },
  );
}

async function resolveTenantSlugWithCustomDomain(
  req: NextRequest,
): Promise<{ tenantSlug: string | null; customDomain: TenantCustomDomainBinding | null }> {
  const hostname = req.headers.get("host")?.split(":")[0] ?? "";
  const customDomain = await lookupTenantCustomDomain(hostname);

  if (customDomain && customDomainRoutesTraffic(customDomain)) {
    return { tenantSlug: customDomain.tenantSlug, customDomain };
  }

  return { tenantSlug: resolveTenantSlug(req), customDomain: null };
}

function handleCustomDomainRequest(
  req: NextRequest,
  binding: TenantCustomDomainBinding,
): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  const tenantSlug = binding.tenantSlug;
  const requestHeaders = buildRequestWithTenant(req, tenantSlug);

  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) {
    return stampTenant(
      NextResponse.next({ request: { headers: requestHeaders } }),
      tenantSlug,
    );
  }

  switch (binding.domainType) {
    case "erp_staff": {
      if (matchesAuthProxy(pathname)) {
        return runAuthProxy(req, requestHeaders, tenantSlug);
      }

      const isForgeRoute =
        pathname === "/forge" ||
        pathname.startsWith("/forge/") ||
        pathname === "/login/forge" ||
        pathname.startsWith("/login/forge/");

      if (isForgeRoute) {
        return runForgeAuthGate(req, requestHeaders, (response) =>
          stampTenant(response, tenantSlug),
        );
      }

      if (isPartnerRoute(pathname)) {
        return runPartnerAuthGate(req, requestHeaders, (response) =>
          stampTenant(response, tenantSlug),
        );
      }

      if (isPearsRoute(pathname)) {
        return runPearsAuthGate(req, requestHeaders, (response) =>
          stampTenant(response, tenantSlug),
        );
      }

      return stampTenant(
        NextResponse.next({ request: { headers: requestHeaders } }),
        tenantSlug,
      );
    }

    case "security_website": {
      if (pathname === "/") {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/security-website";
        return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
      }
      if (isSecurityWebsitePublicPath(pathname)) {
        return stampTenant(
          NextResponse.next({ request: { headers: requestHeaders } }),
          tenantSlug,
        );
      }
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/security-website";
      redirectUrl.search = "";
      return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
    }

    case "public_website": {
      if (pathname === "/") {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = "/public-website";
        return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
      }
      if (pathname === "/public-website" || pathname.startsWith("/public-website/")) {
        return stampTenant(
          NextResponse.next({ request: { headers: requestHeaders } }),
          tenantSlug,
        );
      }
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/public-website";
      redirectUrl.search = "";
      return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
    }

    case "customer_menu": {
      const menuUrl = normalizeCustomerMenuUrl(process.env.NEXT_PUBLIC_CUSTOMER_MENU_URL);
      return NextResponse.redirect(menuUrl);
    }

    default:
      return null;
  }
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
  if (pathname === "/wfm" || pathname.startsWith("/wfm/")) return true;
  if (pathname === "/salon" || pathname.startsWith("/salon/")) return true;
  if (pathname === "/retail" || pathname.startsWith("/retail/")) return true;
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

async function resolveLandingPath(
  roleString: string | null,
  profile: Awaited<ReturnType<typeof fetchBackOfficeUserProfile>>,
  tenantSlug: string | null,
): Promise<string> {
  if (tenantSlug) {
    const moduleContext = await fetchTenantModuleContextForSlug(tenantSlug);
    if (moduleContext) {
      return landingPathForRoleAndBundle(
        roleString,
        moduleContext.productBundle,
        profile,
      );
    }
  }
  return authenticatedLandingPath(roleString, profile);
}

async function enforceTenantBundleGate(
  req: NextRequest,
  tenantSlug: string | null,
  pathname: string,
  roleString: string | null,
  profile: Awaited<ReturnType<typeof fetchBackOfficeUserProfile>>,
): Promise<NextResponse | null> {
  if (!tenantSlug) return null;
  if (isForgePath(pathname) || pathname.startsWith("/login") || pathname.startsWith("/auth/")) {
    return null;
  }

  const moduleContext = await fetchTenantModuleContextForSlug(tenantSlug);
  if (!moduleContext) return null;

  if (
    isTenantPathAllowedForBundle(
      pathname,
      moduleContext.productBundle,
      moduleContext.enabledModules,
    )
  ) {
    return null;
  }

  const landing = landingPathForRoleAndBundle(
    roleString,
    moduleContext.productBundle,
    profile,
  );
  const target = landing.startsWith("/login")
    ? `${loginPathForRequestPath(pathname, req.nextUrl.search)}?error=module_not_enabled`
    : landing;
  return NextResponse.redirect(new URL(target, req.url));
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

  if (
    tenantSlug &&
    !isForgePath(pathname) &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth/") &&
    !isPearzenWebsitePublicPath(pathname) &&
    !isSecurityWebsitePublicPath(pathname)
  ) {
    const tenant = await resolveTenantCompany(tenantSlug);
    if (tenant?.isSuspended) {
      const loginUrl = new URL(
        loginPathForRequestPath(pathname, req.nextUrl.search) || "/login/hq",
        req.url,
      );
      loginUrl.searchParams.set("error", "tenant_suspended");
      return stampTenant(NextResponse.redirect(loginUrl), tenantSlug);
    }
  }

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
      : pathname.startsWith("/shalom-front")
        ? "/login/shalom-front"
      : loginPathForRequestPath(pathname, req.nextUrl.search);
    const loginUrl = new URL(loginPath, req.url);
    loginUrl.searchParams.set("error", "auth_unconfigured");
    return stampTenant(NextResponse.redirect(loginUrl), tenantSlug);
  }

  let cookiesToSet: SupabaseAuthCookie[] = [];

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: supabaseServerAuthCookieOptions(),
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies, headers) {
        cookiesToSet = normalizeSupabaseAuthCookieBatch(cookies);
        replaySupabaseAuthCookiesOnResponse(response, cookiesToSet);
        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        }
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
      : pathname.startsWith("/shalom-front")
        ? "/login/shalom-front"
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

  if (
    isSignInBeforeLatestColomboMidnight(user.last_sign_in_at) &&
    !pathname.startsWith("/auth/") &&
    !(
      pathname.startsWith("/login") &&
      req.nextUrl.searchParams.get("error") === "daily_signout"
    )
  ) {
    const profile = await fetchBackOfficeUserProfile(supabase, user, tenantSlug);
    const employeeId =
      profile.employeeId ??
      (typeof user.user_metadata?.employee_id === "string"
        ? user.user_metadata.employee_id
        : null);

    await recordPortalLoginEvent({
      employeeId,
      portalAuthEmail: user.email ?? null,
      eventType: "daily_signout",
      success: true,
      ipAddress: getClientIp(req),
      detail: `Middleware daily reset; path=${pathname}`,
    });

    await supabase.auth.signOut();
    const loginUrl = new URL(buildDailySignoutRedirectPath(profile), req.url);
    const denied = stampTenant(NextResponse.redirect(loginUrl), tenantSlug);
    cookiesToSet.forEach(({ name, value, options }) => {
      denied.cookies.set(name, value, options);
    });
    clearPortalPinSessionCookies(denied);
    return denied;
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user, tenantSlug);
  const roleString = profile.role;
  const userLoginPath = loginPathForRole(roleString, profile, user.email);
  const search = req.nextUrl.search;

  const applyCookies = (redirectResponse: NextResponse) => {
    replaySupabaseAuthCookiesOnResponse(redirectResponse, cookiesToSet);
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
    const loginUrl = new URL(userLoginPath, req.url);
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

  if (
    portalGate === "verify_2fa" &&
    pathname !== "/login/verify-2fa" &&
    pathname !== "/login/recover-2fa"
  ) {
    return applyCookies(
      NextResponse.redirect(new URL("/login/verify-2fa", req.url)),
    );
  }

  if (
    portalGate === "setup_unlock_code" &&
    pathname !== "/login/set-unlock-code"
  ) {
    return applyCookies(
      NextResponse.redirect(new URL("/login/set-unlock-code", req.url)),
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
    const loginUrl = new URL(userLoginPath, req.url);
    loginUrl.searchParams.set("error", "geofence_denied");
    const denied = applyCookies(NextResponse.redirect(loginUrl));
    clearPortalPinSessionCookies(denied);
    return denied;
  }

  const fieldStaffBoundary = resolveFieldStaffBoundaryRedirect(
    pathname,
    user.email,
    roleString,
    search,
  );
  if (fieldStaffBoundary) {
    return applyCookies(NextResponse.redirect(new URL(fieldStaffBoundary, req.url)));
  }

  if (pathname === "/") {
    const landing = await resolveLandingPath(roleString, profile, tenantSlug);
    const target =
      landing === "/login" || landing.startsWith("/login/")
        ? `${userLoginPath}?error=no_portal_rank`
        : landing;
    return applyCookies(NextResponse.redirect(new URL(target, req.url)));
  }

  if (pathname === "/hq") {
    const hubPath =
      tenantSlug != null
        ? hubPathForBundle(
            (await fetchTenantModuleContextForSlug(tenantSlug))?.productBundle ??
              "full_erp",
          )
        : "/dashboard";
    return applyCookies(NextResponse.redirect(new URL(hubPath, req.url)));
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (!roleString) {
      return applyCookies(
        NextResponse.redirect(
          new URL("/login?error=no_portal_rank", req.url),
        ),
      );
    }
    if (!canAccessHqHub(roleString) && !profile.rbacGated) {
      const fallback = await resolveLandingPath(roleString, profile, tenantSlug);
      if (fallback && !fallback.startsWith("/login")) {
        return applyCookies(NextResponse.redirect(new URL(fallback, req.url)));
      }
      return applyCookies(
        NextResponse.redirect(
          new URL(`${userLoginPath}?error=wrong_portal`, req.url),
        ),
      );
    }
    if (tenantSlug) {
      const moduleContext = await fetchTenantModuleContextForSlug(tenantSlug);
      if (moduleContext?.productBundle === "wfm_only") {
        return applyCookies(NextResponse.redirect(new URL(WFM_HUB_PATH, req.url)));
      }
    }
    return stampTenant(response, tenantSlug);
  }

  if (pathname === "/wfm" || pathname.startsWith("/wfm/")) {
    if (!roleString) {
      return applyCookies(
        NextResponse.redirect(
          new URL("/login?error=no_portal_rank", req.url),
        ),
      );
    }
    if (!canAccessHqHub(roleString) && !profile.rbacGated) {
      const fallback = await resolveLandingPath(roleString, profile, tenantSlug);
      if (fallback && !fallback.startsWith("/login")) {
        return applyCookies(NextResponse.redirect(new URL(fallback, req.url)));
      }
      return applyCookies(
        NextResponse.redirect(
          new URL(`${userLoginPath}?error=wrong_portal`, req.url),
        ),
      );
    }
    if (tenantSlug) {
      const moduleContext = await fetchTenantModuleContextForSlug(tenantSlug);
      if (moduleContext && moduleContext.productBundle !== "wfm_only") {
        return applyCookies(NextResponse.redirect(new URL("/dashboard", req.url)));
      }
    }
    return stampTenant(response, tenantSlug);
  }

  if (pathname === "/salon" || pathname.startsWith("/salon/")) {
    if (!roleString) {
      return applyCookies(
        NextResponse.redirect(
          new URL("/login?error=no_portal_rank", req.url),
        ),
      );
    }
    if (!canAccessSalonDesk(roleString) && !profile.rbacGated) {
      const fallback = await resolveLandingPath(roleString, profile, tenantSlug);
      const target = fallback.startsWith("/login")
        ? `${userLoginPath}?error=salon_denied`
        : fallback;
      return applyCookies(NextResponse.redirect(new URL(target, req.url)));
    }
    if (tenantSlug) {
      const moduleContext = await fetchTenantModuleContextForSlug(tenantSlug);
      if (moduleContext) {
        const salonEnabled = await isSalonVerticalEnabled(moduleContext.companyId);
        if (!salonEnabled) {
          const hubPath = hubPathForBundle(moduleContext.productBundle);
          return applyCookies(
            NextResponse.redirect(
              new URL(`${hubPath}?error=salon_vertical_inactive`, req.url),
            ),
          );
        }
      }
    }
    return stampTenant(response, tenantSlug);
  }

  if (pathname === "/retail" || pathname.startsWith("/retail/")) {
    if (!roleString) {
      return applyCookies(
        NextResponse.redirect(
          new URL("/login?error=no_portal_rank", req.url),
        ),
      );
    }
    if (!canAccessRetailDesk(roleString) && !profile.rbacGated) {
      const fallback = await resolveLandingPath(roleString, profile, tenantSlug);
      const target = fallback.startsWith("/login")
        ? `${userLoginPath}?error=retail_denied`
        : fallback;
      return applyCookies(NextResponse.redirect(new URL(target, req.url)));
    }
    if (tenantSlug) {
      const moduleContext = await fetchTenantModuleContextForSlug(tenantSlug);
      if (moduleContext) {
        const retailEnabled = await isRetailVerticalEnabled(moduleContext.companyId);
        if (!retailEnabled) {
          const hubPath = hubPathForBundle(moduleContext.productBundle);
          return applyCookies(
            NextResponse.redirect(
              new URL(`${hubPath}?error=retail_vertical_inactive`, req.url),
            ),
          );
        }
      }
    }
    return stampTenant(response, tenantSlug);
  }

  const bundleDenied = await enforceTenantBundleGate(
    req,
    tenantSlug,
    pathname,
    roleString,
    profile,
  );
  if (bundleDenied) {
    return applyCookies(stampTenant(bundleDenied, tenantSlug));
  }

  if (pathname.startsWith("/hq/")) {
    if (pathname === "/hq/audit" || pathname.startsWith("/hq/audit/")) {
      if (!canAccessHqAuditRoute(profile)) {
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

  if (pathname === "/shalom-front" || pathname.startsWith("/shalom-front/")) {
    const shalomEmployee = await resolveShalomEmployeeForUser(user);
    if (!shalomEmployee) {
      const deniedUrl = new URL("/login/shalom-front", req.url);
      deniedUrl.searchParams.set("error", "shalom_denied");
      return applyCookies(NextResponse.redirect(deniedUrl));
    }

    const epf = shalomEmployeeEpfKey(shalomEmployee);
    const authRecord = epf
      ? await getShalomPortalAuthRecord(createSupabaseServiceClient(), epf)
      : null;
    const needsPinSetup = authRecord?.needs_pin_setup ?? false;
    const onSetPin = pathname === "/shalom-front/set-pin";

    if (needsPinSetup && !onSetPin) {
      return applyCookies(
        NextResponse.redirect(new URL("/shalom-front/set-pin", req.url)),
      );
    }
    if (!needsPinSetup && onSetPin) {
      return applyCookies(NextResponse.redirect(new URL("/shalom-front", req.url)));
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

  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    if (!canAccessPathForProfile(pathname, profile, search)) {
      const landing = authenticatedLandingPath(roleString, profile);
      const target = landing.startsWith('/login')
        ? `${userLoginPath}?error=wrong_portal`
        : landing;
      return applyCookies(NextResponse.redirect(new URL(target, req.url)));
    }
    return stampTenant(response, tenantSlug);
  }

  if (pathname === '/ar-collections' || pathname.startsWith('/ar-collections/')) {
    if (!canAccessPathForProfile(pathname, profile, search)) {
      const landing = authenticatedLandingPath(roleString, profile);
      const target = landing.startsWith('/login')
        ? `${userLoginPath}?error=wrong_portal`
        : landing;
      return applyCookies(NextResponse.redirect(new URL(target, req.url)));
    }
    return stampTenant(response, tenantSlug);
  }

  return stampTenant(response, tenantSlug);
}

function handleTenantPortalHost(
  req: NextRequest,
  binding: NonNullable<ReturnType<typeof parseTenantPortalHost>>,
): NextResponse {
  const { pathname, search } = req.nextUrl;
  const tenantSlug = binding.tenantSlug;
  const requestHeaders = buildRequestWithTenant(req, tenantSlug);

  if (pathname.startsWith("/auth/") || pathname.startsWith("/api/")) {
    return stampTenant(
      NextResponse.next({ request: { headers: requestHeaders } }),
      tenantSlug,
    );
  }

  if (pathname === "/") {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = binding.loginPath;
    return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
  }

  if (pathname === "/login") {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = binding.loginPath;
    redirectUrl.search = search;
    return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
  }

  if (
    pathname.startsWith("/login/") &&
    pathname !== binding.loginPath &&
    !isTenantPortalAuthFlowPath(pathname)
  ) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = binding.loginPath;
    redirectUrl.search = "";
    return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
  }

  const platformRedirect = tenantPortalPlatformPathRedirect(pathname, binding);
  if (platformRedirect) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = platformRedirect;
    redirectUrl.search = "";
    return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
  }

  if (
    matchesAuthProxy(pathname) &&
    !pathAllowedOnTenantPortalHost(pathname, search, binding)
  ) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = binding.homePath;
    redirectUrl.search = "";
    return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
  }

  if (matchesAuthProxy(pathname)) {
    return runAuthProxy(req, requestHeaders, tenantSlug);
  }

  if (
    pathname === binding.loginPath ||
    pathname.startsWith(`${binding.loginPath}/`) ||
    isTenantPortalAuthFlowPath(pathname) ||
    pathname === "/account/security" ||
    pathname.startsWith("/account/security/")
  ) {
    return stampTenant(
      NextResponse.next({ request: { headers: requestHeaders } }),
      tenantSlug,
    );
  }

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = binding.homePath;
  redirectUrl.search = "";
  return stampTenant(NextResponse.redirect(redirectUrl), tenantSlug);
}

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get("host")?.split(":")[0] ?? "";
  const { pathname, search } = req.nextUrl;

  const legacyForgeTarget = legacyForgeRedirectHost(hostname);
  if (legacyForgeTarget) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.hostname = legacyForgeTarget;
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl, 308);
  }

  // Staff choose their isolated portal at /login (MD · OM · TM · HQ).
  if (pathname === "/login/head-office") {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login/hq";
    redirectUrl.search = req.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  // Pearzen tech company website — pearzen.tech / www.pearzen.tech (before forge deploy 404 on /).
  if (isPearzenWebsiteHost(hostname)) {
    if (pathname === "/") {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/pearzen-website";
      return NextResponse.redirect(redirectUrl);
    }
    if (isPearzenWebsitePublicPath(pathname)) {
      return NextResponse.next();
    }
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/pearzen-website";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  const deploymentRedirect = deploymentModeRouteRedirect(pathname);
  if (deploymentRedirect === DEPLOYMENT_MODE_NOT_FOUND) {
    return new NextResponse(null, { status: 404 });
  }
  if (deploymentRedirect) {
    if (deploymentRedirect.startsWith("https://")) {
      return NextResponse.redirect(deploymentRedirect);
    }
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = deploymentRedirect;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  const customDomainBinding = await lookupTenantCustomDomain(hostname);
  if (customDomainBinding && customDomainRoutesTraffic(customDomainBinding)) {
    const customResponse = handleCustomDomainRequest(req, customDomainBinding);
    if (customResponse) return customResponse;
  }

  // SaaS Forge hosts (superadmin / forge) — tenant portals live on {slug}.pearzen.tech.
  const host = normalizeHostname(hostname);
  const isForgePlatformHost =
    host === `erp.${tenantBaseDomain()}` || isTenantRedirectPlatformHost(hostname);

  const portalBinding = parseTenantPortalHost(hostname);
  if (portalBinding) {
    return handleTenantPortalHost(req, portalBinding);
  }

  if (isDedicatedPartnerHost(hostname)) {
    if (pathname === "/") {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/partners";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
    if (
      !isPartnerRoute(pathname) &&
      !pathname.startsWith("/auth/") &&
      !pathname.startsWith("/api/")
    ) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/partners";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isDedicatedPearsHost(hostname)) {
    if (pathname === "/") {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/pears/profile";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
    if (
      !isPearsRoute(pathname) &&
      !pathname.startsWith("/auth/") &&
      !pathname.startsWith("/api/")
    ) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/pears/profile";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isDedicatedForgeHost(hostname)) {
    const forgeRedirect = dedicatedForgeHostErpRedirectPath(pathname);
    if (forgeRedirect) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = forgeRedirect;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (
    isForgePlatformHost &&
    !isForgeOnlyPath(pathname) &&
    !pathname.startsWith("/auth/") &&
    !pathname.startsWith("/api/")
  ) {
    const slug = defaultTenantSlugForPlatformHost(
      req.cookies.get(TENANT_SLUG_COOKIE)?.value,
      hostname,
    );
    if (!slug) {
      if (
        pathname === "/select-tenant" ||
        pathname.startsWith("/select-tenant/") ||
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/api/")
      ) {
        return NextResponse.next();
      }
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/select-tenant";
      redirectUrl.search = search;
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.redirect(tenantSubdomainUrl(slug, pathname, search));
  }

  // Shalom Residence public site — shalom.pearzen.tech (policies + future bookings).
  if (isShalomPublicHost(hostname)) {
    const internalPath = shalomPublicInternalPath(pathname);
    if (internalPath) {
      if (internalPath !== pathname) {
        const rewriteUrl = req.nextUrl.clone();
        rewriteUrl.pathname = internalPath;
        return NextResponse.rewrite(rewriteUrl);
      }
      return NextResponse.next();
    }
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
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
    const isLoginPath =
      pathname === "/login" ||
      pathname.startsWith("/login/") ||
      pathname.startsWith("/auth/");

    if (isLoginPath) {
      const requestHeaders = buildRequestWithTenant(req, queryTenant);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    const clean = req.nextUrl.clone();
    clean.searchParams.delete("tenant");
    return NextResponse.redirect(clean);
  }

  const { tenantSlug } = await resolveTenantSlugWithCustomDomain(req);
  const requestHeaders = buildRequestWithTenant(req, tenantSlug);

  if (matchesAuthProxy(req.nextUrl.pathname)) {
    return runAuthProxy(req, requestHeaders, tenantSlug);
  }

  const isForgeRoute =
    pathname === "/forge" ||
    pathname.startsWith("/forge/") ||
    pathname === "/login/forge" ||
    pathname.startsWith("/login/forge/");

  if (isForgeRoute) {
    const forgeSlug = isDedicatedForgeHost(hostname) ? null : tenantSlug;
    const forgeHeaders = buildRequestWithTenant(req, forgeSlug);
    return runForgeAuthGate(req, forgeHeaders, (response) => {
      if (isDedicatedForgeHost(hostname)) {
        clearTenantSlugCookie(response);
      }
      return stampTenant(response, forgeSlug);
    });
  }

  const isPartnerRouteMatch = isPartnerRoute(pathname);
  const isPearsRouteMatch = isPearsRoute(pathname);

  if (isPearsRouteMatch) {
    return runPearsAuthGate(req, requestHeaders, (response) =>
      stampTenant(response, tenantSlug),
    );
  }

  if (isPartnerRouteMatch) {
    return runPartnerAuthGate(req, requestHeaders, (response) =>
      stampTenant(response, tenantSlug),
    );
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
