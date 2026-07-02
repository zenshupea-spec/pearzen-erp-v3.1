import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  assertPearsWebsiteClientCanSignIn,
  resolvePearsProfileEntryPath,
} from '../../../lib/pears-website-client-auth';

import LoginShell from '../LoginShell';

const LOGIN_ERRORS: Record<string, string> = {
  oauth_failed: 'Google sign-in failed. Please try again.',
  pears_denied:
    'This Google account is not linked to a Pearzen website client shop. Use the email on your website purchase, or ask your web manager.',
  missing_email: 'No email on your Google account. Try a different sign-in.',
};

export default async function PearsLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const authError = params.error ? LOGIN_ERRORS[params.error] ?? null : null;
  const oauthNext = params.next?.startsWith('/') ? params.next : '/pears/profile';

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const gate = await assertPearsWebsiteClientCanSignIn(user.email);
    if (gate.ok) {
      redirect(await resolvePearsProfileEntryPath(user.email));
    }
  }

  const logoUrl = await getCompanyLogoUrl();

  return (
    <LoginShell
      variant="pears"
      logoUrl={logoUrl}
      authError={authError}
      oauthNext={oauthNext}
    />
  );
}
