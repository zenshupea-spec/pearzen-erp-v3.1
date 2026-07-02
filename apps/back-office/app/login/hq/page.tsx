import LoginShell from '../LoginShell';
import { renderPortalLoginPage } from '../../../lib/portal-login-server';

const HQ_ERRORS = {
  hq_denied:
    'HQ Staff Portal requires HR, FM, EA, or provisioned RBAC access on your MNR record.',
  hr_denied:
    'HR Operations Desk requires HR, FM, EA, MD, or OD rank — or provisioned RBAC access on your MNR record.',
  session_rejected:
    'Sign-in was rejected on your other device. Your password was reset — contact HR for a new OTP.',
  signed_in_elsewhere:
    'Your session ended because your account was opened on another device.',
  setup_session:
    'Setup session expired. Sign in again with work email + the 6-digit OTP from HR on this page.',
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
