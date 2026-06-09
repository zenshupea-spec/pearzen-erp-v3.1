import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getHeadOfficePortalAuthByEmail,
  hasValidOtpSetupSessionForUser,
  hasValidPortalPinSessionForUser,
  requiresHeadOfficePortalPin,
} from '../../../lib/head-office-portal-auth';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context';

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
    redirect('/login/head-office');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!requiresHeadOfficePortalPin(profile, user.email)) {
    redirect(authenticatedLandingPath(profile.role, profile));
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
  if (!authRecord || !authRecord.is_active) {
    await supabase.auth.signOut();
    const error = !authRecord ? 'not_provisioned' : 'access_revoked';
    redirect(`/login/head-office?error=${error}`);
  }

  if (
    !authRecord.needs_pin_setup &&
    (await hasValidPortalPinSessionForUser(profile.employeeId!, user.email))
  ) {
    redirect(authenticatedLandingPath(profile.role, profile));
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  const authError =
    params.error === 'session'
      ? 'Session expired. Enter your code again.'
      : null;

  return (
    <VerifyPinForm
      logoUrl={logoUrl}
      companyName={tenant?.name ?? null}
      needsSetup={authRecord.needs_pin_setup}
      authError={authError}
    />
  );
}
