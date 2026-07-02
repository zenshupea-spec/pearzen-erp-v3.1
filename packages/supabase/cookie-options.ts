import type { CookieOptions } from "@supabase/ssr";

/** Response headers Supabase SSR attaches when auth cookies are refreshed. */
export const SUPABASE_AUTH_REFRESH_RESPONSE_HEADERS = {
  "Cache-Control":
    "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

export type SupabaseAuthCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function supabaseAuthCookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function supabaseAuthCookieOptions(
  overrides: CookieOptions = {},
): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: supabaseAuthCookieSecure(),
    ...overrides,
  };
}

/** Middleware, route handlers, and server actions — tokens are httpOnly. */
export function supabaseServerAuthCookieOptions(): CookieOptions {
  return supabaseAuthCookieOptions({ httpOnly: true });
}

/** Browser client — httpOnly cannot be set from `document.cookie`. */
export function supabaseBrowserAuthCookieOptions(): CookieOptions {
  return supabaseAuthCookieOptions();
}

export function mergeSupabaseAuthCookieOptions(
  options: CookieOptions | undefined,
  serverSide = true,
): CookieOptions {
  const base = serverSide
    ? supabaseServerAuthCookieOptions()
    : supabaseBrowserAuthCookieOptions();
  return { ...base, ...options };
}

export function normalizeSupabaseAuthCookieBatch(
  cookiesToSet: SupabaseAuthCookie[],
  serverSide = true,
): SupabaseAuthCookie[] {
  return cookiesToSet.map(({ name, value, options }) => ({
    name,
    value,
    options: mergeSupabaseAuthCookieOptions(options, serverSide),
  }));
}

export function applySupabaseAuthRefreshHeaders(
  setHeader: (key: string, value: string) => void,
): void {
  for (const [key, value] of Object.entries(
    SUPABASE_AUTH_REFRESH_RESPONSE_HEADERS,
  )) {
    setHeader(key, value);
  }
}

export function applySupabaseAuthCookieSetAll(
  cookiesToSet: SupabaseAuthCookie[],
  setCookie: (name: string, value: string, options: CookieOptions) => void,
  setHeader: ((key: string, value: string) => void) | undefined,
  headers: Record<string, string> | undefined,
  serverSide = true,
): void {
  for (const { name, value, options } of normalizeSupabaseAuthCookieBatch(
    cookiesToSet,
    serverSide,
  )) {
    setCookie(name, value, options);
  }

  if (headers && setHeader) {
    for (const [key, value] of Object.entries(headers)) {
      setHeader(key, value);
    }
    return;
  }

  if (cookiesToSet.length > 0 && setHeader) {
    applySupabaseAuthRefreshHeaders(setHeader);
  }
}
