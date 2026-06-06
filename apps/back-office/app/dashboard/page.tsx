import { redirect } from 'next/navigation';

import MasterHubView from '../../components/hq/MasterHubView';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access';

export const dynamic = 'force-dynamic';

export default async function HqMasterHubPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login/head-office');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;

  if (!role) {
    redirect('/login/head-office?error=no_portal_rank');
  }

  const profileName =
    profile.full_name?.trim() || user.email?.split('@')[0] || 'User';
  const canAccessExecutive = role === 'MD' || role === 'OD';

  return (
    <MasterHubView
      role={role}
      profileName={profileName}
      canAccessExecutive={canAccessExecutive}
    />
  );
}
