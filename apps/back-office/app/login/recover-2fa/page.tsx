import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  enforceColomboDailySignOutIfStale,
} from '../../../lib/portal-login-server';
import {
  getHeadOfficePortalAuthByEmail,
  hasValidPortalPinSessionForUser,
  requiresHeadOfficePortalPin,
  resolveHeadOfficePortalEntryPath,
} from '../../../lib/head-office-portal-auth';
import { isDailySignoutRedirectPath } from '../../../lib/portal-sl-midnight';
import { buildHeadOfficePortalResetPath } from '../../../lib/head-office-portal-reset-path';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { loginPathForRole } from '../../../lib/portal-isolation';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';

import Recover2faForm from './Recover2faForm';

export default async function Recover2faPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const signInPath = loginPathForRole(profile.role, profile);

  const dailySignOut = await enforceColomboDailySignOutIfStale(
    supabase,
    user,
    profile,
  );
  if (dailySignOut) redirect(dailySignOut.redirectPath);

  if (!requiresHeadOfficePortalPin(profile, user.email)) {
    redirect(authenticatedLandingPath(profile.role, profile));
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
  if (!authRecord || !authRecord.is_active) {
    redirect(buildHeadOfficePortalResetPath(`${signInPath}?error=not_provisioned`));
  }

  if (authRecord.needs_pin_setup) redirect('/login/set-pin');
  if (!authRecord.two_factor_enabled) redirect('/login/setup-2fa');

  const entryPath = await resolveHeadOfficePortalEntryPath(
    profile,
    user.email,
    user.last_sign_in_at,
  );
  if (entryPath !== '/login/verify-2fa' && entryPath !== '/login/recover-2fa') {
    if (isDailySignoutRedirectPath(entryPath)) {
      redirect(buildHeadOfficePortalResetPath(entryPath));
    }
    redirect(entryPath);
  }

  if (!(await hasValidPortalPinSessionForUser(profile.employeeId!, user.email))) {
    redirect('/login/verify-pin');
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  return <Recover2faForm logoUrl={logoUrl} companyName={tenant?.name ?? null} />;
}
