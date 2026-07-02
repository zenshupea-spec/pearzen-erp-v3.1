import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { replaySupabaseAuthCookiesOnResponse } from '../../../packages/supabase/auth-cookie-handlers';
import {
  normalizeSupabaseAuthCookieBatch,
  supabaseServerAuthCookieOptions,
  type SupabaseAuthCookie,
} from '../../../packages/supabase/cookie-options';
import { isForgeOperatorEmail } from './forge-access';
import {
  forgeLocalDevSkipsSecurityGates,
  isForgeLocalDevRequestFromReq,
} from './forge-local-dev';
import {
  clearForgePortalSessionCookiesOnResponse,
  forgeGateRedirectPath,
  hasValidForgeGoogleSession,
  hasValidForgePasswordSession,
  isForgeGatePath,
  resolveForgeAccessGate,
  resolveForgePortalEntryPath,
} from './forge-portal-session-gate';
import { isSignInBeforeLatestColomboMidnight } from './portal-sl-midnight';

type CookieToSet = SupabaseAuthCookie;

export async function runForgeAuthGate(
  req: NextRequest,
  requestHeaders: Headers,
  stampTenant: (response: NextResponse) => NextResponse,
): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const cookiesToSet: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseServerAuthCookieOptions(),
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookies) {
          cookiesToSet.splice(
            0,
            cookiesToSet.length,
            ...normalizeSupabaseAuthCookieBatch(cookies),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const applyCookies = (response: NextResponse) => {
    replaySupabaseAuthCookiesOnResponse(response, cookiesToSet);
    return stampTenant(response);
  };

  const publicForgePaths = new Set([
    '/login/forge/forgot-password',
    '/login/forge/recover-2fa',
  ]);

  if (publicForgePaths.has(pathname)) {
    return applyCookies(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (pathname === '/login/forge/await-session') {
    if (!user?.email) {
      return applyCookies(
        NextResponse.redirect(new URL('/login/forge', req.url)),
      );
    }
    return applyCookies(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (pathname === '/login/forge') {
    if (user?.email && (await isForgeOperatorEmail(user.email))) {
      const localDevBypass = isForgeLocalDevRequestFromReq(req);
      const hasPassword = await hasValidForgePasswordSession(
        req,
        user.email,
        user.last_sign_in_at,
      );
      const hasGoogle = await hasValidForgeGoogleSession(
        req,
        user.email,
        user.last_sign_in_at,
      );
      const credentialsReady = localDevBypass
        ? hasPassword
        : hasGoogle && hasPassword;

      if (credentialsReady) {
        const landing =
          localDevBypass && forgeLocalDevSkipsSecurityGates()
            ? '/forge'
            : await resolveForgePortalEntryPath(
                user.email,
                user.last_sign_in_at,
              );
        if (landing !== '/login/forge' && !landing.startsWith('/login/forge?')) {
          return applyCookies(NextResponse.redirect(new URL(landing, req.url)));
        }
      }
    }
    return applyCookies(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (!user?.email) {
    return applyCookies(
      NextResponse.redirect(new URL('/login/forge', req.url)),
    );
  }

  if (!(await isForgeOperatorEmail(user.email))) {
    return applyCookies(
      NextResponse.redirect(new URL('/login/forge?error=forge_denied', req.url)),
    );
  }

  if (
    isSignInBeforeLatestColomboMidnight(user.last_sign_in_at) &&
    !pathname.startsWith('/login/forge')
  ) {
    await supabase.auth.signOut();
    const denied = NextResponse.redirect(
      new URL('/login/forge?error=daily_signout', req.url),
    );
    clearForgePortalSessionCookiesOnResponse(denied);
    return applyCookies(denied);
  }

  const gate = await resolveForgeAccessGate(req, user.email, user.last_sign_in_at);
  const target = forgeGateRedirectPath(gate);

  if (gate !== 'ok') {
    if (pathname !== target) {
      return applyCookies(NextResponse.redirect(new URL(target, req.url)));
    }
    return applyCookies(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const forgeSetupPaths = new Set([
    '/login/forge/set-pin',
    '/login/forge/setup-2fa',
    '/login/forge/set-unlock-code',
  ]);

  if (
    isForgeGatePath(pathname) &&
    pathname !== '/login/forge' &&
    !forgeSetupPaths.has(pathname)
  ) {
    return applyCookies(
      NextResponse.redirect(new URL('/forge', req.url)),
    );
  }

  return applyCookies(NextResponse.next({ request: { headers: requestHeaders } }));
}
