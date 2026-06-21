'use server';

import {
  beginForgeTotpSetup,
  confirmForgeTotpSetup,
  setForgePinSessionCookies,
} from '../../../../lib/forge-portal-auth';
import { getAuthenticatedForgeSession } from '../../../../lib/forge-portal-session';

export async function loadForgeTotpSetupAction() {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const result = await beginForgeTotpSetup(session.user.email);
  if (!result.ok) return { error: result.error ?? 'Could not start 2FA setup.' };

  return {
    secret: result.secret,
    uri: result.uri,
    email: session.user.email,
  };
}

export async function confirmForgeTotpSetupAction(code: string) {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const result = await confirmForgeTotpSetup(session.user.email, code);
  if (!result.ok) return { error: result.error ?? 'Verification failed.' };

  return {
    success: true as const,
    backupCodes: result.backupCodes ?? [],
  };
}

export async function finishForgeTotpSetupAction() {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  await setForgePinSessionCookies(session.user.email);
  const { redirect } = await import('next/navigation');
  redirect('/login/forge/set-unlock-code');
}
