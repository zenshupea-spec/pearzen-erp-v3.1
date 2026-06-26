'use server';

import { redirect } from 'next/navigation';

import {
  beginHeadOfficeTotpSetup,
  confirmHeadOfficeTotpSetup,
  setPortalPinSessionCookies,
} from '../../../lib/head-office-portal-auth';
import { getAuthenticatedPortalSession } from '../../../lib/head-office-portal-session';

export async function loadHeadOfficeTotpSetupAction() {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await beginHeadOfficeTotpSetup(
    session.profile.employeeId!,
    session.user.email,
  );
  if (!result.ok) return { error: result.error ?? 'Could not start 2FA setup.' };

  return {
    secret: result.secret,
    uri: result.uri,
    email: session.user.email,
  };
}

export async function confirmHeadOfficeTotpSetupAction(code: string) {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await confirmHeadOfficeTotpSetup(
    session.profile.employeeId!,
    session.user.email,
    code,
  );
  if (!result.ok) return { error: result.error ?? 'Verification failed.' };

  return {
    success: true,
    backupCodes: result.backupCodes ?? [],
    landing: session.landing,
  };
}

export async function finishHeadOfficeTotpSetupAction() {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  await setPortalPinSessionCookies(
    session.profile.employeeId!,
    session.user.email,
  );
  redirect('/login/set-unlock-code');
}
