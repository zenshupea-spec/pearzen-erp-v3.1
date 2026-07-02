import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getHeadOfficePortalAuthByEmail,
  hasValidOtpSetupSessionForUser,
  requiresHeadOfficePortalPin,
} from '../../../lib/head-office-portal-auth';
import { buildHeadOfficePortalResetPath } from '../../../lib/head-office-portal-reset-path';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { loginPathForRole } from '../../../lib/portal-isolation';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';

import SetHeadOfficePinForm from './SetHeadOfficePinForm';

export default async function SetHeadOfficePinPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect('/login');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const signInPath = loginPathForRole(profile.role, profile);

  if (!requiresHeadOfficePortalPin(profile, user.email)) {
    redirect(authenticatedLandingPath(profile.role, profile));
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
  if (!authRecord || !authRecord.is_active) {
    const error = !authRecord ? 'not_provisioned' : 'access_revoked';
    redirect(buildHeadOfficePortalResetPath(`${signInPath}?error=${error}`));
  }

  if (!authRecord.needs_pin_setup) {
    redirect('/login/verify-pin');
  }

  if (!(await hasValidOtpSetupSessionForUser(profile.employeeId!, user.email))) {
    redirect(
      buildHeadOfficePortalResetPath(`${signInPath}?error=setup_session`),
    );
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  return (
    <SetHeadOfficePinForm
      logoUrl={logoUrl}
      companyName={tenant?.name ?? null}
      portalRole={profile.role}
      rbacGated={profile.rbacGated}
    />
  );
}
