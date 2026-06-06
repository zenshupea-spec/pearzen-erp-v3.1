import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import HqHubShell from '../../components/hq/HqHubShell';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access';

export default async function HQLayout({ children }: { children: ReactNode }) {
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
  const isGodMode = role === 'MD' || role === 'OD';

  if (!role || (!isGodMode && role !== 'HR' && role !== 'FM')) {
    redirect('/login/head-office?error=hq_denied');
  }

  const profileName =
    profile.full_name?.trim() || user.email?.split('@')[0] || 'User';

  return (
    <HqHubShell profileName={profileName} profileRank={role}>
      {children}
    </HqHubShell>
  );
}
