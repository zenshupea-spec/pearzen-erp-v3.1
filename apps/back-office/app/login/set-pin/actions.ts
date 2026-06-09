'use server';

import { redirect } from 'next/navigation';

import {
  setHeadOfficePortalPin,
  setPortalPinSessionCookies,
} from '../../../lib/head-office-portal-auth';
import { getAuthenticatedPortalSession } from '../../../lib/head-office-portal-session';

export async function setHeadOfficePinAction(newPin: string, confirmPin: string) {
  if (newPin !== confirmPin) {
    return { error: 'PINs do not match.' };
  }

  const session = await getAuthenticatedPortalSession();
  if ('error' in session) return { error: session.error };

  const result = await setHeadOfficePortalPin(
    session.profile.employeeId!,
    session.user.email,
    newPin,
  );
  if (result.error) return { error: result.error };

  await setPortalPinSessionCookies(
    session.profile.employeeId!,
    session.user.email,
  );
  redirect(session.landing);
}
