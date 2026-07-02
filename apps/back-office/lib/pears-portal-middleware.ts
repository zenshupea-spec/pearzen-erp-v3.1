import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { replaySupabaseAuthCookiesOnResponse } from '../../../packages/supabase/auth-cookie-handlers';
import {
  normalizeSupabaseAuthCookieBatch,
  supabaseServerAuthCookieOptions,
  type SupabaseAuthCookie,
} from '../../../packages/supabase/cookie-options';
import {
  assertPearsWebsiteClientCanSignIn,
  pearsLoginErrorCode,
  resolvePearsProfileEntryPath,
} from './pears-website-client-auth';

type CookieToSet = SupabaseAuthCookie;

export async function runPearsAuthGate(
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

  if (pathname === '/login/pears') {
    if (user?.email) {
      const gate = await assertPearsWebsiteClientCanSignIn(user.email);
      if (gate.ok) {
        const landing = await resolvePearsProfileEntryPath(user.email);
        if (landing !== '/login/pears') {
          return applyCookies(NextResponse.redirect(new URL(landing, req.url)));
        }
      }
    }
    return applyCookies(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (!user?.email) {
    const loginUrl = new URL('/login/pears', req.url);
    const returnPath = `${pathname}${req.nextUrl.search}`;
    if (returnPath.startsWith('/') && !returnPath.startsWith('//')) {
      loginUrl.searchParams.set('next', returnPath);
    }
    return applyCookies(NextResponse.redirect(loginUrl));
  }

  const gate = await assertPearsWebsiteClientCanSignIn(user.email);
  if (!gate.ok) {
    await supabase.auth.signOut();
    const loginUrl = new URL('/login/pears', req.url);
    loginUrl.searchParams.set('error', pearsLoginErrorCode(gate.reason));
    return applyCookies(NextResponse.redirect(loginUrl));
  }

  if (pathname === '/pears') {
    const landing = await resolvePearsProfileEntryPath(user.email);
    return applyCookies(NextResponse.redirect(new URL(landing, req.url)));
  }

  return applyCookies(NextResponse.next({ request: { headers: requestHeaders } }));
}
