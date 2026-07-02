import LoginShell from '../LoginShell';
import { renderPortalLoginPage } from '../../../lib/portal-login-server';

const TM_ERRORS = {
  setup_session:
    'Setup session expired. Sign in again with work email + the 6-digit OTP from HR or OD on this page.',
};

export default async function TmLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const page = await renderPortalLoginPage('tm', searchParams, TM_ERRORS);

  return (
    <LoginShell
      variant="tm"
      logoUrl={page.logoUrl}
      companyName={page.companyName}
      authError={page.authError}
      authErrorDetail={page.authErrorDetail}
      oauthNext={page.oauthNext}
    />
  );
}
