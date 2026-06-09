import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import HqLayoutShell from '../../components/hq/HqLayoutShell';
import { canAccessPortalActivityLedger } from '../../lib/audit-portals';
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
  const pathname = (await headers()).get('x-pathname') ?? '';
  const isPortalActivityLedger =
    pathname === '/hq/audit' || pathname.startsWith('/hq/audit/');

  if (!role) {
    redirect('/login/head-office?error=no_portal_rank');
  }

  if (isPortalActivityLedger) {
    if (!canAccessPortalActivityLedger(role)) {
      redirect('/dashboard');
    }
  } else if (!isGodMode && role !== 'HR' && role !== 'FM' && role !== 'OM') {
    redirect('/login/head-office?error=hq_denied');
  }

  const profileName =
    profile.full_name?.trim() || user.email?.split('@')[0] || 'User';

  return (
    <HqLayoutShell profileName={profileName} profileRank={role}>
      {children}
    </HqLayoutShell>
  );
}
