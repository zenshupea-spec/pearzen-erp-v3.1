import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { NextResponse } from "next/server";

/**
 * Supabase SSR client for Next.js route handlers.
 * This version can write cookies to the provided `response`.
 */
export function createSupabaseRouteClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );
}

