'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  PORTAL_IDLE_LOCK_MINUTES,
  clearPortalPinSessionCookiesStore,
  invalidatePortalPasswordAfterRejectedLogin,
  resetHeadOfficeUnlockCodeWithPassword,
  resolveHeadOfficePortalEntryPath,
  setHeadOfficeUnlockCode,
  setPortalPinSessionCookies,
  verifyHeadOfficeUnlockCode,
} from '../../lib/head-office-portal-auth';
import { clearVaultUnlockSessionCookiesStore } from '../../lib/executive-vault-session';
import { clearHeadOfficePortalSession } from '../../lib/head-office-portal-sign-out';
import { getAuthenticatedPortalSession } from '../../lib/head-office-portal-session';
import { recordPortalLoginEvent } from '../../lib/portal-login-events';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { loginPathForRole } from '../../lib/portal-isolation';
import { isExecutiveRank } from '../../lib/portal-role-utils';
import {
  displaceOtherAuthSessionsAfterLogin,
  getActivePendingLoginForEmployee,
  getPendingLoginById,
  resolvePendingLoginChallenge,
  revokeSupabaseSession,
} from '../../lib/portal-pending-login';
import { notifySignedInElsewhereSessionDisplacement } from '../../lib/portal-session-displacement-email';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../packages/supabase/server';

function decodeAccessTokenSessionId(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
    ) as { session_id?: unknown };
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

export async function saveHeadOfficeUnlockCodeAction(code: string) {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await setHeadOfficeUnlockCode(
    session.profile.employeeId!,
    session.user.email,
    code,
  );
  if (!result.ok) return { error: result.error ?? 'Could not save unlock code.' };

  await setPortalPinSessionCookies(
    session.profile.employeeId!,
    session.user.email,
  );
  redirect(session.landing);
}

export async function verifyHeadOfficeUnlockCodeAction(code: string) {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await verifyHeadOfficeUnlockCode(
    session.profile.employeeId!,
    code,
  );

  const headerStore = await headers();
  const ip =
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerStore.get('x-real-ip') ??
    null;

  await recordPortalLoginEvent({
    employeeId: session.profile.employeeId,
    portalAuthEmail: session.user.email,
    eventType: result.ok ? 'unlock_code_success' : 'unlock_code_failure',
    success: result.ok,
    ipAddress: ip,
  });

  if (!result.ok) return { error: result.error ?? 'Invalid unlock code.' };

  await setPortalPinSessionCookies(
    session.profile.employeeId!,
    session.user.email,
  );
  return { success: true as const };
}

export async function invalidatePortalIdleLockAction() {
  await clearPortalPinSessionCookiesStore();
  await clearVaultUnlockSessionCookiesStore();
  return { ok: true as const };
}

/** Voluntary HO sign-out — clears `pz_ho_*` cookies and Supabase session. */
export async function signOutHeadOfficePortalAction(redirectPath?: string) {
  await clearHeadOfficePortalSession();
  if (redirectPath !== undefined) {
    const path =
      redirectPath.startsWith('/') && !redirectPath.startsWith('//')
        ? redirectPath
        : '/login/hq';
    redirect(path);
  }
  return { ok: true as const };
}

export async function resetHeadOfficeUnlockCodeAction(
  password: string,
  newCode: string,
) {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await resetHeadOfficeUnlockCodeWithPassword(
    session.profile.employeeId!,
    password,
    newCode,
  );
  if (!result.ok) return { error: result.error ?? 'Could not reset unlock code.' };

  return { success: true as const };
}

export async function getPortalIdleLockMinutesAction() {
  return { minutes: PORTAL_IDLE_LOCK_MINUTES };
}

export async function getHeadOfficePortalSessionContextAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { signInPath: '/login' as const, isExecutive: false as const };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  return {
    signInPath: loginPathForRole(profile.role, profile),
    isExecutive: isExecutiveRank(profile.role),
  };
}

export async function resolveHeadOfficePostChallengeLandingAction(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return '/login';

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  return resolveHeadOfficePortalEntryPath(
    profile,
    user.email,
    user.last_sign_in_at,
  );
}

export async function pollSessionChallengeAction() {
  return { pending: null as null };
}

export async function respondSessionChallengeAction(
  pendingId: string,
  action: 'approve' | 'reject',
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const currentSessionId = session?.access_token
    ? decodeAccessTokenSessionId(session.access_token)
    : null;

  const pending = await getPendingLoginById(pendingId);
  if (!pending || pending.status !== 'pending') {
    return { error: 'Challenge expired.' };
  }

  if (pending.incumbentSessionId !== currentSessionId) {
    return { error: 'Only the active device can respond.' };
  }

  const resolved = await resolvePendingLoginChallenge({ pendingId, action });
  if (!resolved.ok) return { error: resolved.error };

  if (action === 'reject') {
    await revokeSupabaseSession(pending.challengerSessionId);
    if (pending.employeeId) {
      await invalidatePortalPasswordAfterRejectedLogin(pending.employeeId);
      await recordPortalLoginEvent({
        employeeId: pending.employeeId,
        eventType: 'password_login_failure',
        success: false,
        detail: 'Concurrent login rejected — password invalidated.',
      });
    }
    return { success: true };
  }

  if (pending.incumbentSessionId) {
    await revokeSupabaseSession(pending.incumbentSessionId);
    await notifySignedInElsewhereSessionDisplacement({
      employeeId: pending.employeeId,
      reason: 'approved_elsewhere',
    });
  }
  await clearHeadOfficePortalSession();
  return { success: true, signedOut: true as const };
}

export async function awaitSessionChallengeAction(_pendingId: string) {
  return { status: 'auto_approved' as const };
}

export async function maybeCreateSessionChallengeAfterLogin(
  employeeId: string,
  userId: string,
  currentSessionId: string,
): Promise<string | null> {
  await displaceOtherAuthSessionsAfterLogin({
    userId,
    currentSessionId,
    employeeId,
  });
  return null;
}
