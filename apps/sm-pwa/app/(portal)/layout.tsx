import { getCompanyLogoUrl } from '../../../../packages/supabase/company-branding';
import SMPortalShell from '../components/SMPortalShell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const logoUrl = await getCompanyLogoUrl();
  return <SMPortalShell logoUrl={logoUrl}>{children}</SMPortalShell>;
}
