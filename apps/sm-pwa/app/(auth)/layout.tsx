import { getCompanyLogoUrl } from '../../../../packages/supabase/company-branding';
import SMPortalAuthShell from '../components/SMPortalAuthShell';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const logoUrl = await getCompanyLogoUrl();
  return <SMPortalAuthShell logoUrl={logoUrl}>{children}</SMPortalAuthShell>;
}
