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
  displaceOtherAuthSessionsAfterLogin,
  decodeSupabaseAccessTokenSessionId,
  getPendingLoginById,
  resolvePendingLoginChallenge,
  revokeSupabaseSession,
} from './portal-pending-login';
import { notifySignedInElsewhereSessionDisplacement } from './portal-session-displacement-email';
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../packages/supabase/server';

export async function maybeCreateForgeSessionChallengeAfterLogin(
  operatorEmail: string,
  userId: string,
  currentSessionId: string,
): Promise<string | null> {
  await displaceOtherAuthSessionsAfterLogin({
    userId,
    currentSessionId,
    operatorEmail,
  });
  return null;
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
    await maybeCreateForgeSessionChallengeAfterLogin(
      operatorEmail,
      user.id,
      sessionId,
    );
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
  return { pending: null as null };
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
    await notifySignedInElsewhereSessionDisplacement({
      operatorEmail: pending.operatorEmail,
      reason: 'approved_elsewhere',
    });
  }
  await supabase.auth.signOut();
  await clearForgePortalSessionCookies();
  return { success: true, signedOut: true as const };
}

export async function awaitForgeSessionChallengeAction(_pendingId: string) {
  return { status: 'auto_approved' as const };
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
  const localDevBypass = await import('./forge-local-dev').then((mod) =>
    mod.isForgeLocalDevRequest(),
  );

  if (
    !localDevBypass &&
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
