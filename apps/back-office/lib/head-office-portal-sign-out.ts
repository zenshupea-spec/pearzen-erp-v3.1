import 'server-only';

import type { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { clearPortalPinSessionCookies, clearPortalPinSessionCookiesStore } from './head-office-portal-auth';
import {
  clearVaultUnlockSessionCookiesStore,
  HO_VAULT_UNLOCK_COOKIE,
} from './executive-vault-session';

/** Clears all `pz_ho_*` portal session cookies on a route/middleware response. */
export function clearHeadOfficePortalSessionOnResponse(response: NextResponse): void {
  clearPortalPinSessionCookies(response);
  response.cookies.delete(HO_VAULT_UNLOCK_COOKIE);
}

/** Clears all `pz_ho_*` portal session cookies and ends the Supabase session. */
export async function clearHeadOfficePortalSession(): Promise<void> {
  await clearPortalPinSessionCookiesStore();
  await clearVaultUnlockSessionCookiesStore();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
