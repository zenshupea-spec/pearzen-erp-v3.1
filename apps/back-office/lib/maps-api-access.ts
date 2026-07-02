import { createSupabaseServerClient } from '../../../packages/supabase/server';

import {
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from './hr-portal-access-server';
import {
  getHeadOfficePortalAuthByEmail,
  hasValidPortalPinSessionForUser,
  requiresHeadOfficePortalPin,
} from './head-office-portal-auth';

export { resolveGoogleMapsBrowserKey } from './maps-api-key';

export type MapsApiAccessResult =
  | { ok: true; profile: BackOfficeUserProfile; email: string }
  | { ok: false };

/** Requires signed-in staff with an employee rank (HO portal gates when applicable). */
export async function assertMapsApiAccess(): Promise<MapsApiAccessResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { ok: false };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!profile.role) {
    return { ok: false };
  }

  if (requiresHeadOfficePortalPin(profile, user.email)) {
    const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
    if (!authRecord?.is_active) {
      return { ok: false };
    }

    if (
      authRecord.unlock_code_hash &&
      profile.employeeId &&
      !(await hasValidPortalPinSessionForUser(profile.employeeId, user.email))
    ) {
      return { ok: false };
    }
  }

  return { ok: true, profile, email: user.email };
}
