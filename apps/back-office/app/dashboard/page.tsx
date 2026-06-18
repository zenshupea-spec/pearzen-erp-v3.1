import { redirect } from 'next/navigation';

import MasterHubView from '../../components/hq/MasterHubView';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile, portalPathForRole } from '../../lib/hr-portal-access-server';
import { canAccessHqHub } from '../../lib/hq-hub';
import { loginPathForRole } from '../../lib/portal-isolation';
import { getMasterHubBadges } from '../../lib/master-hub-actions';

export const dynamic = 'force-dynamic';

export default async function HqMasterHubPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login/hq');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;

  if (!role) {
    redirect('/login/hq?error=no_portal_rank');
  }

  if (!canAccessHqHub(role) && !profile.rbacGated) {
    const fallback = portalPathForRole(role) ?? loginPathForRole(role, profile);
    redirect(fallback.startsWith('/login') ? `${fallback}?error=wrong_portal` : fallback);
  }

  const profileName =
    profile.full_name?.trim() || user.email?.split('@')[0] || 'User';
  const badges = await getMasterHubBadges();

  return (
    <MasterHubView
      role={role}
      profileName={profileName}
      badges={badges}
    />
  );
}
