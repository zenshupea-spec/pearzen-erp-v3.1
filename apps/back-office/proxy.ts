import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { verifyOfficeLocation } from "./utils/geofence";

function portalPathForRole(role: string | null | undefined) {
  if (!role) return null;
  if (role === "MD" || role === "OD") return "/md-dashboard";
  if (role === "OM") return "/om-dashboard";
  if (role === "HR") return "/hr-dashboard";
  if (role === "FM") return "/fm-dashboard";
  return null;
}

function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  // Example: "client, proxy1, proxy2"
  return xff.split(",")[0]?.trim() ?? null;
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/md-dashboard/:path*",
    "/om-dashboard/:path*",
    "/hr-dashboard/:path*",
    "/fm-dashboard/:path*",
  ],
};

export async function proxy(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // In case env is misconfigured, let Next render normally (will likely 500 later).
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  // Buffer cookie writes performed by @supabase/ssr so we can replay them onto
  // redirect responses (middleware can return either `next()` or `redirect()`).
  let cookiesToSet: Array<{
    name: string;
    value: string;
    options?: any;
  }> = [];

  const response = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies) {
        cookiesToSet = cookies as any;
        (cookies as any).forEach(({ name, value, options }: any) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    // Login page should remain accessible.
    if (req.nextUrl.pathname === "/") return response;

    return NextResponse.redirect(new URL("/", req.url));
  }

  const user = userData.user;
  const email = user.email;

  // Fetch role from `users` table for both teleportation and geofence gating.
  const { data: roleData, error: roleError } = await supabase
    .from("users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  const role = roleError ? null : (roleData as { role?: unknown })?.role;
  const roleString = typeof role === "string" ? role : null;
  const expectedPortal = portalPathForRole(roleString);
  const isGodMode = roleString === "MD" || roleString === "OD";

  const { pathname } = req.nextUrl;

  // Role-based teleportation after login: if user hits "/", send them to portal.
  if (pathname === "/") {
    if (expectedPortal) {
      const redirectResponse = NextResponse.redirect(
        new URL(expectedPortal, req.url)
      );
      cookiesToSet.forEach(({ name, value, options }) => {
        redirectResponse.cookies.set(name, value, options);
      });
      return redirectResponse;
    }
    return response;
  }

  // If they are visiting a generic protected route, redirect to their portal.
  if (pathname.startsWith("/dashboard")) {
    if (expectedPortal) {
      const redirectResponse = NextResponse.redirect(
        new URL(expectedPortal, req.url)
      );
      cookiesToSet.forEach(({ name, value, options }) => {
        redirectResponse.cookies.set(name, value, options);
      });
      return redirectResponse;
    }

    return NextResponse.redirect(new URL("/", req.url));
  }

  // Protect portal routes and enforce the correct portal for the role.
  if (
    pathname === "/md-dashboard" ||
    pathname.startsWith("/md-dashboard/") ||
    pathname === "/om-dashboard" ||
    pathname.startsWith("/om-dashboard/") ||
    pathname === "/hr-dashboard" ||
    pathname.startsWith("/hr-dashboard/") ||
    pathname === "/fm-dashboard" ||
    pathname.startsWith("/fm-dashboard/")
  ) {
    // "God Mode" users can access any protected dashboard route.
    if (isGodMode) {
      return response;
    }

    if (!expectedPortal || pathname !== expectedPortal) {
      if (expectedPortal) {
        const redirectResponse = NextResponse.redirect(
          new URL(expectedPortal, req.url)
        );
        cookiesToSet.forEach(({ name, value, options }) => {
          redirectResponse.cookies.set(name, value, options);
        });
        return redirectResponse;
      }
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Geofence / IP restriction check before rendering standard dashboards.
    // Executive Override: verified inside `verifyOfficeLocation`.
    if (
      expectedPortal === "/om-dashboard" ||
      expectedPortal === "/hr-dashboard" ||
      expectedPortal === "/fm-dashboard"
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
        return NextResponse.redirect(
          new URL("/?error=geofence_denied", req.url)
        );
      }
    }

    return response;
  }

  return response;
}
