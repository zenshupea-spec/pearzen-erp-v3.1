import LoginShell from '../LoginShell';
import { renderPortalLoginPage } from '../../../lib/portal-login-server';

const HQ_ERRORS = {
  hq_denied:
    'HQ Staff Portal requires HR, FM, EA, or provisioned RBAC access on your MNR record.',
};

export default async function HqStaffPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; role?: string }>;
}) {
  const page = await renderPortalLoginPage('hq', searchParams, HQ_ERRORS);

  return (
    <LoginShell
      variant="hq"
      logoUrl={page.logoUrl}
      companyName={page.companyName}
      authError={page.authError}
      authErrorDetail={page.authErrorDetail}
      oauthNext={page.oauthNext}
    />
  );
}
