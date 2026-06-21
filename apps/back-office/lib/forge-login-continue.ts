'use server';

import { redirect } from 'next/navigation';

import {
  clearForgePortalSessionCookies,
  invalidateForgePasswordAfterRejectedLogin,
  resolveForgePortalEntryPath,
  setForgeSetupSessionCookies,
} from './forge-portal-auth';
import { getAuthenticatedForgeSession } from './forge-portal-session';
import {
  autoApproveExpiredPendingLogins,
  createPendingLoginChallengeForOperator,
  decodeSupabaseAccessTokenSessionId,
  getActivePendingLoginForOperator,
  getPendingLoginById,
  resolvePendingLoginChallenge,
  revokeSupabaseSession,
} from './portal-pending-login';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../packages/supabase/server';

export async function maybeCreateForgeSessionChallengeAfterLogin(
  operatorEmail: string,
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

  const pending = await createPendingLoginChallengeForOperator({
    operatorEmail,
    challengerSessionId: currentSessionId,
    incumbentSessionId: String(incumbentId),
  });

  return pending?.id ?? null;
}

export async function continueForgeLoginAfterAuth(operatorEmail: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const sessionId = session?.access_token
    ? decodeSupabaseAccessTokenSessionId(session.access_token)
    : null;

  if (sessionId && user?.id) {
    const pendingChallengeId = await maybeCreateForgeSessionChallengeAfterLogin(
      operatorEmail,
      user.id,
      sessionId,
    );
    if (pendingChallengeId) {
      redirect(`/login/forge/await-session?pending=${pendingChallengeId}`);
    }
  }

  const record = await import('./forge-portal-auth').then((mod) =>
    mod.getForgePortalAuthRecord(operatorEmail),
  );
  if (record?.needs_pin_setup || !record?.pin_hash) {
    await setForgeSetupSessionCookies(operatorEmail);
    redirect('/login/forge/set-pin');
  }

  const landing = await resolveForgePortalEntryPath(
    operatorEmail,
    user?.last_sign_in_at ?? null,
  );
  redirect(landing);
}

export async function pollForgeSessionChallengeAction() {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { pending: null as null };

  await autoApproveExpiredPendingLogins();

  const pending = await getActivePendingLoginForOperator(session.user.email);
  if (!pending) return { pending: null as null };

  const supabase = await createSupabaseServerClient();
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();
  const currentSessionId = authSession?.access_token
    ? decodeSupabaseAccessTokenSessionId(authSession.access_token)
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

export async function respondForgeSessionChallengeAction(
  pendingId: string,
  action: 'approve' | 'reject',
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const currentSessionId = session?.access_token
    ? decodeSupabaseAccessTokenSessionId(session.access_token)
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
    if (pending.operatorEmail) {
      await invalidateForgePasswordAfterRejectedLogin(pending.operatorEmail);
    }
    return { success: true };
  }

  if (pending.incumbentSessionId) {
    await revokeSupabaseSession(pending.incumbentSessionId);
  }
  await supabase.auth.signOut();
  await clearForgePortalSessionCookies();
  return { success: true, signedOut: true as const };
}

export async function awaitForgeSessionChallengeAction(pendingId: string) {
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

export async function resolveForgePostChallengeLandingAction(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return '/login/forge';

  const {
    getForgePortalAuthRecord,
    hasValidForgeGoogleSessionForUser,
    hasValidForgePasswordSessionForUser,
    setForgeSetupSessionCookies,
  } = await import('./forge-portal-auth');

  if (
    !(await hasValidForgeGoogleSessionForUser(
      user.email,
      user.last_sign_in_at ?? null,
    ))
  ) {
    return '/login/forge';
  }

  if (
    !(await hasValidForgePasswordSessionForUser(
      user.email,
      user.last_sign_in_at ?? null,
    ))
  ) {
    return '/login/forge';
  }

  const record = await getForgePortalAuthRecord(user.email);
  if (record?.needs_pin_setup || !record?.pin_hash) {
    await setForgeSetupSessionCookies(user.email);
    return '/login/forge/set-pin';
  }

  return resolveForgePortalEntryPath(user.email, user.last_sign_in_at ?? null);
}
