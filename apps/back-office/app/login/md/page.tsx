import LoginShell from '../LoginShell';
import { renderPortalLoginPage } from '../../../lib/portal-login-server';

const MD_ERRORS = {
  executive_denied:
    'MD Portal requires MD or OD rank on your MNR record.',
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
