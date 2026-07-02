'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  FORGE_IDLE_LOCK_MINUTES,
  resetForgeUnlockCodeWithPassword,
  setForgePinSessionCookies,
  setForgeUnlockCode,
  verifyForgeUnlockCode,
} from '../../lib/forge-portal-auth';
import { getAuthenticatedForgeSession } from '../../lib/forge-portal-session';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';

export async function saveForgeUnlockCodeAction(code: string) {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const result = await setForgeUnlockCode(session.user.email, code);
  if (!result.ok) return { error: result.error ?? 'Could not save unlock code.' };

  await setForgePinSessionCookies(session.user.email);
  redirect(session.landing);
}

export async function verifyForgeUnlockCodeAction(code: string) {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const result = await verifyForgeUnlockCode(session.user.email, code);
  if (!result.ok) return { error: result.error ?? 'Invalid unlock code.' };
  return { success: true as const };
}

export async function resetForgeUnlockCodeAction(
  password: string,
  newCode: string,
) {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const result = await resetForgeUnlockCodeWithPassword(
    session.user.email,
    password,
    newCode,
  );
  if (!result.ok) return { error: result.error ?? 'Could not reset unlock code.' };

  return { success: true as const };
}

export async function getForgeIdleLockMinutesAction() {
  return { minutes: FORGE_IDLE_LOCK_MINUTES };
}

export async function forgeSignOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login/forge');
}

export async function requestForgePasswordResetAction(email: string) {
  const { issueForgeTempPasswordReset } = await import('../../lib/forge-portal-auth');
  return issueForgeTempPasswordReset(email);
}

import {
  awaitForgeSessionChallengeAction as awaitForgeSessionChallenge,
  pollForgeSessionChallengeAction as pollForgeSessionChallenge,
  resolveForgePostChallengeLandingAction as resolveForgePostChallengeLanding,
  respondForgeSessionChallengeAction as respondForgeSessionChallenge,
} from '../../lib/forge-login-continue';

export async function awaitForgeSessionChallengeAction(pendingId: string) {
  return awaitForgeSessionChallenge(pendingId);
}

export async function pollForgeSessionChallengeAction() {
  return pollForgeSessionChallenge();
}

export async function resolveForgePostChallengeLandingAction() {
  return resolveForgePostChallengeLanding();
}

export async function respondForgeSessionChallengeAction(
  pendingId: string,
  action: 'approve' | 'reject',
) {
  return respondForgeSessionChallenge(pendingId, action);
}

export async function requestForge2faRecoveryAction(email: string) {
  const {
    canRequestForge2faEmailRecovery,
    resetForgeTwoFactor,
  } = await import('../../lib/forge-portal-auth');
  const { sendForge2faRecoveryEmail } = await import('../../lib/forge-portal-email');
  const { randomInt } = await import('crypto');

  const cooldown = await canRequestForge2faEmailRecovery(email);
  if (!cooldown.ok) {
    return { error: cooldown.error };
  }

  const recoveryCode = String(randomInt(100_000, 1_000_000));
  const record = await import('../../lib/forge-portal-auth').then((mod) =>
    mod.getForgePortalAuthRecord(email),
  );
  const deliveryEmail =
    record?.recovery_email?.trim() ||
    record?.main_email?.trim() ||
    email.trim().toLowerCase();

  const reset = await resetForgeTwoFactor(email);
  if (!reset.ok) return { error: reset.error };

  const mail = await sendForge2faRecoveryEmail({
    to: deliveryEmail,
    recoveryCode,
    operatorEmail: email.trim().toLowerCase(),
  });

  if (!mail.ok) {
    return { error: mail.error };
  }
  if (!mail.emailed) {
    return {
      error: 'Email delivery is not configured. Set RESEND_API_KEY and FORGE_EMAIL_FROM.',
    };
  }

  const headerStore = await headers();
  void headerStore;

  return {
    success: true as const,
    emailed: true,
  };
}
