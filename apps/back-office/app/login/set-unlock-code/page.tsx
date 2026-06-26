import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getHeadOfficePortalAuthByEmail,
  requiresHeadOfficePortalPin,
} from '../../../lib/head-office-portal-auth';
import { buildHeadOfficePortalResetPath } from '../../../lib/head-office-portal-reset-path';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { loginPathForRole } from '../../../lib/portal-isolation';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';
import SetUnlockCodeForm from './SetUnlockCodeForm';

export default async function SetUnlockCodePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const signInPath = loginPathForRole(profile.role, profile);

  if (!requiresHeadOfficePortalPin(profile, user.email)) {
    redirect(authenticatedLandingPath(profile.role, profile));
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
  if (!authRecord?.is_active) {
    redirect(buildHeadOfficePortalResetPath(`${signInPath}?error=not_provisioned`));
  }
  if (authRecord.unlock_code_hash) {
    redirect(authenticatedLandingPath(profile.role, profile));
  }

  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  return (
    <SetUnlockCodeForm logoUrl={logoUrl} companyName={tenant?.name ?? null} />
  );
}
