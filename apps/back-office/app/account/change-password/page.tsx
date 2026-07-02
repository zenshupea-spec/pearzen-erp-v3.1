import { redirect } from 'next/navigation';

import ChangePasswordClient from './ChangePasswordClient';
import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getHeadOfficePortalAuthByEmail,
  requiresHeadOfficePortalPin,
} from '../../../lib/head-office-portal-auth';
import { resolveHeadOfficePasswordExpiryContext } from '../../../lib/head-office-portal-password-expiry';
import {
  authenticatedLandingPath,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../../lib/portal-role-utils';
import { resolveSafePortalReturnPath } from '../../../lib/portal-return-path';
import { resolveTenantCompanyFromRequest } from '../../../lib/tenant-context-server';

type PageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

function formatPasswordExpiryDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function ChangePasswordPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login/hq');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const landingPath = authenticatedLandingPath(profile.role, profile);

  if (!requiresHeadOfficePortalPin(profile, user.email)) {
    redirect(landingPath);
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(user.email);
  if (!authRecord || !authRecord.is_active) {
    redirect('/login/hq?error=not_provisioned');
  }

  const expiry = resolveHeadOfficePasswordExpiryContext(authRecord);
  const forced = expiry.isPasswordExpired;
  const returnPath = resolveSafePortalReturnPath(query.returnTo, landingPath);
  const profileName =
    profile.full_name?.trim() || user.email?.split('@')[0] || 'Staff';
  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  return (
    <ChangePasswordClient
      returnPath={returnPath}
      forced={forced}
      mustChangePassword={expiry.mustChangePassword}
      fullName={profileName}
      rank={normalizePortalRole(profile.role)}
      passwordExpiresAt={formatPasswordExpiryDate(expiry.passwordExpiresAt)}
      daysUntilExpiry={expiry.daysUntilExpiry}
      companyName={tenant?.name ?? null}
      logoUrl={logoUrl}
    />
  );
}
