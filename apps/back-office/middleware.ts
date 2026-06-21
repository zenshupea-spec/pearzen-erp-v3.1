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
  isTenantPortalAuthFlowPath,
  parseTenantPortalHost,
  pathAllowedOnTenantPortalHost,
} from "./lib/tenant-portal-host";
import { CVS_TENANT_SLUG } from "./lib/company-ids";
import { canAccessPortalActivityLedger } from "./lib/audit-portals";
import { canAccessHqHub, WFM_HUB_PATH } from "./lib/hq-hub";
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
import { isDedicatedPartnerHost, isPartnerRoute } from "./lib/partner-host";
import { runPartnerAuthGate } from "./lib/partner-portal-middleware";
import {
  isDedicatedForgeHost,
  legacyForgeRedirectHost,
  normalizeHostname,
} from "./lib/forge-host";
import { runForgeAuthGate } from "./lib/forge-portal-middleware";
import { isSignInBeforeLatestColomboMidnight } from "./lib/portal-sl-midnight";
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
import {
  decodeSupabaseAccessTokenSessionId,
  getActivePendingChallengeForChallenger,
} from "./lib/portal-pending-login";

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
  "/settings",
  "/settings/:path*",
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

  const portalBinding = parseTenantPortalHost(hostname);
  if (portalBinding) return portalBinding.tenantSlug;

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

  if (
    isSignInBeforeLatestColomboMidnight(user.last_sign_in_at) &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth/")
  ) {
    await supabase.auth.signOut();
    const loginUrl = new URL(
      loginPathForRequestPath(pathname, req.nextUrl.search) || "/login/hq",
      req.url,
    );
    loginUrl.searchParams.set("error", "daily_signout");
    const denied = stampTenant(NextResponse.redirect(loginUrl), tenantSlug);
    cookiesToSet.forEach(({ name, value, options }) => {
      denied.cookies.set(name, value, options);
    });
    clearPortalPinSessionCookies(denied);
    return denied;
  }

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

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const currentSessionId = session?.access_token
    ? decodeSupabaseAccessTokenSessionId(session.access_token)
    : null;

  if (
    currentSessionId &&
    profile.employeeId &&
    pathname !== "/login/await-session"
  ) {
    const pendingChallenge = await getActivePendingChallengeForChallenger({
      employeeId: profile.employeeId,
      challengerSessionId: currentSessionId,
    });
    if (pendingChallenge) {
      const awaitUrl = new URL("/login/await-session", req.url);
      awaitUrl.searchParams.set("pending", pendingChallenge.id);
      return applyCookies(NextResponse.redirect(awaitUrl));
    }
  }

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
    const loginUrl = new URL(userLoginPath === "/login" ? "/login/hq" : userLoginPath, req.url);
    loginUrl.searchParams.set("error", "geofence_denied");
    const denied = applyCookies(NextResponse.redirect(loginUrl));
    clearPortalPinSessionCookies(denied);
    return denied;
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
          new URL("/login/hq?error=no_portal_rank", req.url),
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
          new URL("/login/hq?error=no_portal_rank", req.url),
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
          new URL("/login/hq?error=no_portal_rank", req.url),
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
          new URL("/login/hq?error=no_portal_rank", req.url),
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

  if (
    pathname.startsWith("/forge") ||
    pathname.startsWith("/pearzen-website") ||
    pathname.startsWith("/security-website") ||
    pathname === "/clientlogin" ||
    pathname.startsWith("/clientlogin/")
  ) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = binding.homePath;
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

  const customDomainBinding = await lookupTenantCustomDomain(hostname);
  if (customDomainBinding && customDomainRoutesTraffic(customDomainBinding)) {
    const customResponse = handleCustomDomainRequest(req, customDomainBinding);
    if (customResponse) return customResponse;
  }

  // SaaS Forge hosts (superadmin / forge) — tenant portals live on {slug}.pearzen.tech.
  const host = normalizeHostname(hostname);
  const isForgePlatformHost =
    host === `erp.${tenantBaseDomain()}` || isTenantRedirectPlatformHost(hostname);

  // Pearzen tech company website — pearzen.tech / www.pearzen.tech (marketing only).
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

  if (
    isDedicatedForgeHost(hostname) &&
    !isForgeOnlyPath(pathname) &&
    !pathname.startsWith("/auth/") &&
    !pathname.startsWith("/api/")
  ) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.startsWith("/login") ? "/login/forge" : "/forge";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

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
    return runForgeAuthGate(req, requestHeaders, (response) =>
      stampTenant(response, tenantSlug),
    );
  }

  const isPartnerRouteMatch = isPartnerRoute(pathname);

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
