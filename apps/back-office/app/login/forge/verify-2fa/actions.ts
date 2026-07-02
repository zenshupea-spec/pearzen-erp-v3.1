'use server';

import { redirect } from 'next/navigation';

import {
  setForgePinSessionCookies,
  verifyForgeTotpLogin,
} from '../../../../lib/forge-portal-auth';
import { getAuthenticatedForgeSession } from '../../../../lib/forge-portal-session';
import { createSupabaseServerClient } from '../../../../../../packages/supabase/server';

export async function verifyForgeTotpAction(code: string) {
  const session = await getAuthenticatedForgeSession();
  if ('error' in session) return { error: session.error };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await verifyForgeTotpLogin(
    session.user.email,
    code,
    user?.last_sign_in_at ?? null,
  );
  if (!result.ok) return { error: result.error ?? 'Invalid code.' };

  await setForgePinSessionCookies(session.user.email);

  const { getForgePortalAuthRecord } = await import('../../../../lib/forge-portal-auth');
  const record = await getForgePortalAuthRecord(session.user.email);
  if (!record?.unlock_code_hash) {
    redirect('/login/forge/set-unlock-code');
  }

  redirect('/forge');
}
