import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { isForgeOperatorEmail } from './forge-access';
import {
  clearForgePortalSessionCookiesOnResponse,
  forgeGateRedirectPath,
  hasValidForgeGoogleSession,
  hasValidForgePasswordSession,
  isForgeGatePath,
  resolveForgeAccessGate,
  resolveForgePortalEntryPath,
} from './forge-portal-auth';
import { isSignInBeforeLatestColomboMidnight } from './portal-sl-midnight';
import {
  decodeSupabaseAccessTokenSessionId,
  getActivePendingChallengeForChallenger,
} from './portal-pending-login';

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

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
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookies) {
          cookies.forEach((cookie) => cookiesToSet.push(cookie));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const applyCookies = (response: NextResponse) => {
    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return stampTenant(response);
  };

  const redirectForgeChallengerIfPending = async (): Promise<NextResponse | null> => {
    if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
      return null;
    }
    if (pathname === '/login/forge/await-session') {
      return null;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const currentSessionId = session?.access_token
      ? decodeSupabaseAccessTokenSessionId(session.access_token)
      : null;
    if (!currentSessionId) return null;

    const pendingChallenge = await getActivePendingChallengeForChallenger({
      operatorEmail: user.email,
      challengerSessionId: currentSessionId,
    });
    if (!pendingChallenge) return null;

    const awaitUrl = new URL('/login/forge/await-session', req.url);
    awaitUrl.searchParams.set('pending', pendingChallenge.id);
    return applyCookies(NextResponse.redirect(awaitUrl));
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

  const challengerRedirect = await redirectForgeChallengerIfPending();
  if (challengerRedirect) return challengerRedirect;

  if (pathname === '/login/forge') {
    if (user?.email && (await isForgeOperatorEmail(user.email))) {
      const hasGoogle = await hasValidForgeGoogleSession(
        req,
        user.email,
        user.last_sign_in_at,
      );
      const hasPassword = await hasValidForgePasswordSession(
        req,
        user.email,
        user.last_sign_in_at,
      );

      if (hasGoogle && hasPassword) {
        const landing = await resolveForgePortalEntryPath(
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
