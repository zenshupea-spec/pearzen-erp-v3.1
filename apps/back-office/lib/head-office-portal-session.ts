import { createSupabaseServerClient } from '../../../packages/supabase/server';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from './hr-portal-access';
import {
  getHeadOfficePortalAuthByEmail,
  requiresHeadOfficePortalPin,
} from './head-office-portal-auth';

export async function getAuthenticatedPortalSession(): Promise<
  | {
      user: { email: string };
      profile: BackOfficeUserProfile;
      landing: string;
    }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: 'Session expired. Sign in again.' };
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!profile.role) {
    return { error: 'No portal rank on your employee record.' };
  }

  if (requiresHeadOfficePortalPin(profile, user.email)) {
    const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
    if (!authRecord || !authRecord.is_active) {
      return {
        error: !authRecord
          ? 'Portal access not provisioned. Contact your Managing Director.'
          : 'Portal access has been revoked. Contact your Managing Director.',
      };
    }
  }

  return {
    user: { email: user.email },
    profile,
    landing: authenticatedLandingPath(profile.role, profile),
  };
}
