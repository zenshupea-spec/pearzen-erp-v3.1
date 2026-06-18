import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getHeadOfficePortalAuthByEmail,
  hasValidPortalPinSessionForUser,
  requiresHeadOfficePortalPin,
  resolveHeadOfficePortalEntryPath,
} from '../../../lib/head-office-portal-auth';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';

import Verify2faForm from './Verify2faForm';

export default async function Verify2faPage() {
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
    await supabase.auth.signOut();
    redirect('/login/head-office?error=not_provisioned');
  }

  if (authRecord.needs_pin_setup) redirect('/login/set-pin');
  if (!authRecord.two_factor_enabled) redirect('/login/setup-2fa');

  const entryPath = await resolveHeadOfficePortalEntryPath(
    profile,
    user.email,
    user.last_sign_in_at,
  );
  if (entryPath !== '/login/verify-2fa') {
    redirect(entryPath);
  }

  if (!(await hasValidPortalPinSessionForUser(profile.employeeId!, user.email))) {
    redirect('/login/verify-pin');
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  return <Verify2faForm logoUrl={logoUrl} companyName={tenant?.name ?? null} />;
}
