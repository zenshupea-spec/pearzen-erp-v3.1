import { redirect } from 'next/navigation';

import { ExecutiveBrandThemeProvider } from '../../../components/executive/ExecutiveBrandTheme';
import { loadExecutiveBrandTokens } from '../../../lib/cvs-brand-tokens-server';
import { getCafeLogoUrl } from '../../../../../packages/supabase/cafe-branding';
import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  cafeEmployeeEpfKey,
  getCafePortalAuthRecord,
  resolveCafeEmployeeForUser,
} from '../../../lib/cafe-front-auth';
import { canAccessFrontOfficeAsExecutive } from '../../../lib/front-office-executive-access';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

import CafeFrontLoginForm from './CafeFrontLoginForm';

const LOGIN_ERRORS: Record<string, string> = {
  cafe_denied: 'Access denied — active café staff EPF required.',
};

export default async function CafeFrontLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const authError = params.error ? LOGIN_ERRORS[params.error] ?? null : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await fetchBackOfficeUserProfile(supabase, user);
    if (canAccessFrontOfficeAsExecutive(profile)) {
      redirect('/cafe-front');
    }

    const employee = await resolveCafeEmployeeForUser(user);
    if (employee) {
      const epf = cafeEmployeeEpfKey(employee);
      const service = createSupabaseServiceClient();
      const authRecord = epf ? await getCafePortalAuthRecord(service, epf) : null;
      redirect(authRecord?.needs_pin_setup ? '/cafe-front/set-pin' : '/cafe-front');
    }
  }

  const [cafeLogoUrl, companyLogoUrl, brandTokens] = await Promise.all([
    getCafeLogoUrl(),
    getCompanyLogoUrl(),
    loadExecutiveBrandTokens(),
  ]);

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <CafeFrontLoginForm
        cafeLogoUrl={cafeLogoUrl}
        companyLogoUrl={companyLogoUrl}
        authError={authError}
      />
    </ExecutiveBrandThemeProvider>
  );
}
