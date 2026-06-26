import { getCompanyLogoUrl } from '../../../../../../packages/supabase/company-branding';
import { resolveTenantCompanyFromRequest } from '../../../../lib/tenant-context-server';
import RequestAccessCodeForm from './RequestAccessCodeForm';

export default async function MdRequestAccessCodePage() {
  const tenant = await resolveTenantCompanyFromRequest();
  const logoUrl = await getCompanyLogoUrl(tenant?.id);

  return (
    <RequestAccessCodeForm
      logoUrl={logoUrl}
      companyName={tenant?.name ?? null}
    />
  );
}
