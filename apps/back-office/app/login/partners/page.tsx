import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  assertPartnerCanSignIn,
  resolvePartnerPortalEntryPath,
} from '../../../lib/partner-portal-auth';

import LoginShell from '../LoginShell';

const LOGIN_ERRORS: Record<string, string> = {
  oauth_failed: 'Google sign-in failed. Please try again.',
  partner_denied:
    'This Google account is not provisioned as a Pearzen service partner. Contact the platform operator.',
  partner_inactive:
    'Your partner account is inactive. Contact Pearzen support to restore access.',
};

export default async function PartnersLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const authError = params.error ? LOGIN_ERRORS[params.error] ?? null : null;
  const oauthNext = params.next?.startsWith('/') ? params.next : '/partners';

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const gate = await assertPartnerCanSignIn(user.email);
    if (gate.ok) {
      redirect(await resolvePartnerPortalEntryPath(user.email));
    }
  }

  const logoUrl = await getCompanyLogoUrl();

  return (
    <LoginShell
      variant="partners"
      logoUrl={logoUrl}
      authError={authError}
      oauthNext={oauthNext}
    />
  );
}
