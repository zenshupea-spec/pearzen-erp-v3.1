import { getCompanyLogoUrl } from '../../../../packages/supabase/company-branding';
import FieldLoginForm from './FieldLoginForm';

export default async function FieldLoginPage() {
  const logoUrl = await getCompanyLogoUrl();
  return <FieldLoginForm logoUrl={logoUrl} />;
}
