'use server';

import { redirect } from 'next/navigation';

import {
  getForgePortalAuthRecord,
  setForgePinSessionCookies,
  setForgePortalPin,
} from '../../../../lib/forge-portal-auth';
import { getAuthenticatedForgeSession } from '../../../../lib/forge-portal-session';

export async function setForgePinAction(newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const result = await setForgePortalPin(session.user.email, newPassword);
  if (!result.ok) return { error: result.error ?? 'Could not save password.' };

  await setForgePinSessionCookies(session.user.email);
  redirect('/login/forge/setup-2fa');
}

export async function loadForgePinSetupState() {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const record = await getForgePortalAuthRecord(session.user.email);
  return {
    needsSetup: Boolean(record?.needs_pin_setup || !record?.pin_hash),
  };
}
