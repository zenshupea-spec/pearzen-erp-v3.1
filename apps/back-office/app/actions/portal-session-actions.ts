'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  PORTAL_IDLE_LOCK_MINUTES,
  invalidatePortalPasswordAfterRejectedLogin,
  resetHeadOfficeUnlockCodeWithPassword,
  setHeadOfficeUnlockCode,
  setPortalPinSessionCookies,
  verifyHeadOfficeUnlockCode,
} from '../../lib/head-office-portal-auth';
import { getAuthenticatedPortalSession } from '../../lib/head-office-portal-session';
import { recordPortalLoginEvent } from '../../lib/portal-login-events';
import {
  autoApproveExpiredPendingLogins,
  createPendingLoginChallenge,
  getActivePendingLoginForEmployee,
  getPendingLoginById,
  resolvePendingLoginChallenge,
  revokeSupabaseSession,
} from '../../lib/portal-pending-login';
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
  return { success: true as const };
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

export async function pollSessionChallengeAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return { pending: null as null };

  const profile = await getAuthenticatedPortalSession();
  if ('error' in profile || !profile.profile.employeeId) {
    return { pending: null as null };
  }

  await autoApproveExpiredPendingLogins();

  const pending = await getActivePendingLoginForEmployee(
    profile.profile.employeeId,
  );
  if (!pending) return { pending: null as null };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const currentSessionId = session?.access_token
    ? decodeAccessTokenSessionId(session.access_token)
    : null;

  const isIncumbent =
    pending.incumbentSessionId &&
    currentSessionId &&
    pending.incumbentSessionId === currentSessionId;
  const isChallenger =
    currentSessionId && pending.challengerSessionId === currentSessionId;

  if (!isIncumbent && !isChallenger) {
    return { pending: null as null };
  }

  return {
    pending: {
      id: pending.id,
      role: isChallenger ? ('challenger' as const) : ('incumbent' as const),
      expiresAt: pending.expiresAt,
    },
  };
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
  }
  await supabase.auth.signOut();
  return { success: true, signedOut: true as const };
}

export async function awaitSessionChallengeAction(pendingId: string) {
  await autoApproveExpiredPendingLogins();
  const pending = await getPendingLoginById(pendingId);
  if (!pending) return { status: 'expired' as const };

  if (pending.status === 'approved' || pending.status === 'rejected') {
    return { status: pending.status };
  }

  if (pending.status === 'auto_approved') {
    return { status: 'auto_approved' as const };
  }

  if (new Date(pending.expiresAt).getTime() <= Date.now()) {
    return { status: 'expired' as const };
  }

  return { status: 'pending' as const, expiresAt: pending.expiresAt };
}

export async function maybeCreateSessionChallengeAfterLogin(
  employeeId: string,
  userId: string,
  currentSessionId: string,
): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data: incumbentId, error: incumbentError } = await service.rpc(
    'first_other_auth_session_id',
    {
      p_user_id: userId,
      p_current_session_id: currentSessionId,
    },
  );

  if (incumbentError || !incumbentId) return null;

  const pending = await createPendingLoginChallenge({
    employeeId,
    challengerSessionId: currentSessionId,
    incumbentSessionId: String(incumbentId),
  });

  return pending?.id ?? null;
}
