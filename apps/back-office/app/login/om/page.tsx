import LoginShell from '../LoginShell';
import { renderPortalLoginPage } from '../../../lib/portal-login-server';

const OM_ERRORS = {
  setup_session:
    'Setup session expired. Sign in again with work email + the 6-digit OTP from HR or OD on this page.',
};

export default async function OmLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const page = await renderPortalLoginPage('om', searchParams, OM_ERRORS);

  return (
    <LoginShell
      variant="om"
      logoUrl={page.logoUrl}
      companyName={page.companyName}
      authError={page.authError}
      authErrorDetail={page.authErrorDetail}
      oauthNext={page.oauthNext}
    />
  );
}
