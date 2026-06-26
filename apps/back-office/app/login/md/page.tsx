import LoginShell from '../LoginShell';
import { renderPortalLoginPage } from '../../../lib/portal-login-server';

const MD_ERRORS = {
  executive_denied:
    'MD Portal requires MD or OD rank on your MNR record.',
  google_disabled:
    'Google sign-in is not available for MD or OD. Use your work email and portal password.',
  wrong_portal:
    'MD Portal is for Managing Director and Operations Director only.',
  session_rejected:
    'Sign-in was rejected on your other device. Your password was reset — use Request access code on the MD Portal sign-in page.',
  signed_in_elsewhere:
    'Your MD Portal session ended because your account was opened on another device.',
};

export default async function MdPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; role?: string }>;
}) {
  const page = await renderPortalLoginPage('md', searchParams, MD_ERRORS);

  return (
    <LoginShell
      variant="md"
      logoUrl={page.logoUrl}
      companyName={page.companyName}
      authError={page.authError}
      authErrorDetail={page.authErrorDetail}
      oauthNext={page.oauthNext}
    />
  );
}
