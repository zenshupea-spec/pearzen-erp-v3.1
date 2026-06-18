import LoginShell from '../LoginShell';
import { renderPortalLoginPage } from '../../../lib/portal-login-server';

export default async function OmLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const page = await renderPortalLoginPage('om', searchParams);

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
