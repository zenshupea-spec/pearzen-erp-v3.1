import type { NextResponse } from "next/server";
import type { SetAllCookies } from "@supabase/ssr";

import {
  applySupabaseAuthCookieSetAll,
  applySupabaseAuthRefreshHeaders,
  normalizeSupabaseAuthCookieBatch,
  type SupabaseAuthCookie,
} from "./cookie-options";

export function createSupabaseRouteSetAll(response: NextResponse): SetAllCookies {
  return (cookiesToSet, headers) => {
    applySupabaseAuthCookieSetAll(
      cookiesToSet,
      (name, value, options) => response.cookies.set(name, value, options),
      (key, value) => response.headers.set(key, value),
      headers,
    );
  };
}

export function replaySupabaseAuthCookiesOnResponse(
  response: NextResponse,
  cookiesToSet: SupabaseAuthCookie[],
): void {
  for (const { name, value, options } of normalizeSupabaseAuthCookieBatch(
    cookiesToSet,
  )) {
    response.cookies.set(name, value, options);
  }
  if (cookiesToSet.length > 0) {
    applySupabaseAuthRefreshHeaders((key, value) =>
      response.headers.set(key, value),
    );
  }
}
