'use server';

import { redirect } from 'next/navigation';

import {
  getForgePortalAuthRecord,
  setForgePinSessionCookies,
  setForgeSetupSessionCookies,
  verifyForgeAuthPasswordForSetup,
  verifyForgePortalPin,
} from '../../../../lib/forge-portal-auth';
import { getAuthenticatedForgeSession } from '../../../../lib/forge-portal-session';

export async function verifyForgePinAction(password: string) {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const record = await getForgePortalAuthRecord(session.user.email);
  if (record?.needs_pin_setup || !record?.pin_hash) {
    const setup = await verifyForgeAuthPasswordForSetup(
      session.user.email,
      password,
    );
    if (!setup.ok) {
      return { error: setup.error ?? 'Invalid password.' };
    }
    await setForgeSetupSessionCookies(session.user.email);
    redirect('/login/forge/set-pin');
  }

  const result = await verifyForgePortalPin(session.user.email, password);
  if (!result.ok) {
    return { error: result.error ?? 'Invalid password.' };
  }

  await setForgePinSessionCookies(session.user.email);

  const authRecord = await getForgePortalAuthRecord(session.user.email);
  if (!authRecord?.two_factor_enabled) {
    redirect('/login/forge/setup-2fa');
  }
  redirect('/login/forge/verify-2fa');
}
