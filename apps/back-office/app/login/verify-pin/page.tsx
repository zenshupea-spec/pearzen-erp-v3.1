import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getHeadOfficePortalAuthByEmail,
  hasValidOtpSetupSessionForUser,
  requiresHeadOfficePortalPin,
  resolveHeadOfficePortalEntryPath,
} from '../../../lib/head-office-portal-auth';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
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

  if (!authRecord.needs_pin_setup) {
    const entryPath = await resolveHeadOfficePortalEntryPath(
      profile,
      user.email,
      user.last_sign_in_at,
    );
    if (entryPath !== '/login/verify-pin') {
      redirect(entryPath);
    }
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
