import { headers } from 'next/headers';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { resolvePortalAccessGateFromCookies } from './head-office-portal-auth';
import {
  executivePortalGateError,
  headOfficePortalGateRedirectPath,
} from './head-office-portal-gate-paths';
import { EXECUTIVE_DESK_PATH } from './hq-hub';
import { fetchBackOfficeUserProfile } from './hr-portal-access-server';
import { loginPathForRole } from './portal-isolation';
import { isExecutiveRank } from './portal-role-utils';

async function executiveGatePathname(): Promise<string> {
  const headerList = await headers();
  const fromMiddleware = headerList.get('x-pathname')?.trim();
  if (fromMiddleware?.startsWith('/')) return fromMiddleware;
  return EXECUTIVE_DESK_PATH;
}

/** Server-side 2FA + portal gate for MD/OD executive actions (defense in depth under middleware). */
export async function assertExecutivePortalSecurityGate(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: 'You must be signed in.' };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isExecutiveRank(profile.role)) {
    return { ok: true };
  }

  const gate = await resolvePortalAccessGateFromCookies(
    profile,
    user.email,
    user.last_sign_in_at,
    EXECUTIVE_DESK_PATH,
  );

  if (gate === 'ok') {
    return { ok: true };
  }

  if (gate === 'not_provisioned' || gate === 'revoked') {
    return {
      ok: false,
      error:
        gate === 'revoked'
          ? 'Portal access has been revoked.'
          : 'Portal access is not provisioned.',
    };
  }

  return { ok: false, error: executivePortalGateError(gate) };
}

/** Redirect when executive desk routes are accessed without a valid 2FA step-up session. */
export async function enforceExecutivePortalGate(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    const { redirect } = await import('next/navigation');
    redirect('/login/md');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const pathname = await executiveGatePathname();
  const gate = await resolvePortalAccessGateFromCookies(
    profile,
    user.email,
    user.last_sign_in_at,
    pathname,
  );

  const redirectPath = headOfficePortalGateRedirectPath(gate);
  if (redirectPath) {
    const { redirect } = await import('next/navigation');
    redirect(redirectPath);
  }

  if (gate === 'not_provisioned' || gate === 'revoked') {
    const { redirect } = await import('next/navigation');
    const loginPath = loginPathForRole(profile.role, profile);
    redirect(
      `${loginPath}?error=${gate === 'revoked' ? 'access_revoked' : 'not_provisioned'}`,
    );
  }
}
