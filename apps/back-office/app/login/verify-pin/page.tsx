import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  enforceColomboDailySignOutIfStale,
} from '../../../lib/portal-login-server';
import {
  getHeadOfficePortalAuthByEmail,
  requiresHeadOfficePortalPin,
  resolveHeadOfficePortalEntryPath,
} from '../../../lib/head-office-portal-auth';
import { isDailySignoutRedirectPath } from '../../../lib/portal-sl-midnight';
import { isHeadOfficeGeofenceExempt } from '../../../lib/head-office-geofence-exempt';
import { buildHeadOfficePortalResetPath } from '../../../lib/head-office-portal-reset-path';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import {
  loginPathForRole,
  PORTAL_GATEWAY_CARDS,
  staffPortalIdForRole,
} from '../../../lib/portal-isolation';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';

import VerifyPinForm from './VerifyPinForm';

export default async function VerifyPinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect('/login');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const dailySignOut = await enforceColomboDailySignOutIfStale(
    supabase,
    user,
    profile,
  );
  if (dailySignOut) redirect(dailySignOut.redirectPath);

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
    const entryPath = await resolveHeadOfficePortalEntryPath(
      profile,
      user.email,
      user.last_sign_in_at,
    );
    if (entryPath !== '/login/verify-pin') {
      if (isDailySignoutRedirectPath(entryPath)) {
        redirect(buildHeadOfficePortalResetPath(entryPath));
      }
      redirect(entryPath);
    }
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  const authError =
    params.error === 'session'
      ? 'Session expired. Enter your code again.'
      : null;

  const portalId = staffPortalIdForRole(profile.role, profile);
  const portalTitle =
    (portalId
      ? PORTAL_GATEWAY_CARDS.find((card) => card.id === portalId)?.title
      : null) ?? 'Staff Portal';

  return (
    <VerifyPinForm
      logoUrl={logoUrl}
      companyName={tenant?.name ?? null}
      portalTitle={portalTitle}
      workEmail={authRecord.work_email}
      geofenceRequired={!isHeadOfficeGeofenceExempt(profile.role)}
      signInPath={signInPath}
      needsSetup={authRecord.needs_pin_setup}
      authError={authError}
      portalRole={profile.role}
      rbacGated={profile.rbacGated}
    />
  );
}
