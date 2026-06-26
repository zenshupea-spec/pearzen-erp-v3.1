'use server';

import { redirect } from 'next/navigation';

import {
  setPortalPinSessionCookies,
  verifyHeadOfficeTotpLogin,
} from '../../../lib/head-office-portal-auth';
import { getAuthenticatedPortalSession } from '../../../lib/head-office-portal-session';

export async function verifyHeadOfficeTotpAction(code: string) {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await verifyHeadOfficeTotpLogin(
    session.profile.employeeId!,
    session.user.email,
    code,
    session.profile.role,
  );
  if (!result.ok) return { error: result.error ?? 'Invalid code.' };

  if (result.requires2faSetup) {
    redirect('/login/setup-2fa');
  }

  await setPortalPinSessionCookies(
    session.profile.employeeId!,
    session.user.email,
  );
  redirect(session.landing);
}
