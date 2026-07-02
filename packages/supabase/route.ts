import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { NextResponse } from "next/server";

import { createSupabaseRouteSetAll } from "./auth-cookie-handlers";
import { supabaseServerAuthCookieOptions } from "./cookie-options";

/**
 * Supabase SSR client for Next.js route handlers.
 * This version can write cookies to the provided `response`.
 */
export function createSupabaseRouteClient(
  request: NextRequest,
  response: NextResponse,
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseServerAuthCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll: createSupabaseRouteSetAll(response),
      },
    },
  );
}
