'use server';

import { redirect } from 'next/navigation';

import {
  setHeadOfficePortalPin,
  setPortalPinSessionCookies,
  verifyHeadOfficePortalCode,
} from '../../../lib/head-office-portal-auth';
import { getAuthenticatedPortalSession } from '../../../lib/head-office-portal-session';

export async function verifyHeadOfficePinAction(code: string) {
  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await verifyHeadOfficePortalCode(session.user.email, code);
  if (!result.ok) return { error: result.error ?? 'Verification failed.' };

  if (result.needsPinSetup) {
    const { setOtpSetupSessionCookies } = await import(
      '../../../lib/head-office-portal-auth'
    );
    await setOtpSetupSessionCookies(
      session.profile.employeeId!,
      session.user.email,
    );
    redirect('/login/set-pin');
  }

  await setPortalPinSessionCookies(
    session.profile.employeeId!,
    session.user.email,
  );
  redirect(session.landing);
}
