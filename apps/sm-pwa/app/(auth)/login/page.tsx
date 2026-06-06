import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import SMLoginForm from './SMLoginForm';

export default async function SMLogin() {
  const logoUrl = await getCompanyLogoUrl();
  return <SMLoginForm logoUrl={logoUrl} />;
}
