import { redirect } from 'next/navigation';

import HeadOfficeMfaPanel from '../../../components/portal/HeadOfficeMfaPanel';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getHeadOfficePortalAuthByEmail,
  requiresHeadOfficePortalPin,
} from '../../../lib/head-office-portal-auth';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';

export default async function AccountSecurityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login/head-office');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!requiresHeadOfficePortalPin(profile, user.email)) {
    redirect(authenticatedLandingPath(profile.role, profile));
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
  if (!authRecord || !authRecord.is_active) {
    redirect('/login/head-office?error=not_provisioned');
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 lg:px-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
            Account Security
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Manage two-factor authentication for your Head Office portal login.
          </p>
        </header>
        <HeadOfficeMfaPanel />
      </div>
    </div>
  );
}
