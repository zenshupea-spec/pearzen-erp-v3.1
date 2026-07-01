import { redirect } from 'next/navigation';

import { ExecutiveBrandThemeProvider } from '../../../components/executive/ExecutiveBrandTheme';
import { loadExecutiveBrandTokens } from '../../../lib/cvs-brand-tokens-server';
import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  getShalomPortalAuthRecord,
  resolveShalomEmployeeForUser,
  shalomEmployeeEpfKey,
} from '../../../lib/shalom-front-auth';
import { canAccessFrontOfficeAsExecutive } from '../../../lib/front-office-executive-access';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';

import ShalomFrontLoginForm from './ShalomFrontLoginForm';

const LOGIN_ERRORS: Record<string, string> = {
  shalom_denied: 'Access denied — active Shalom caretaker EPF required.',
};

export default async function ShalomFrontLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const authError = params.error ? (LOGIN_ERRORS[params.error] ?? null) : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await fetchBackOfficeUserProfile(supabase, user);
    if (canAccessFrontOfficeAsExecutive(profile)) {
      redirect('/shalom-front');
    }

    const employee = await resolveShalomEmployeeForUser(user);
    if (employee) {
      const epf = shalomEmployeeEpfKey(employee);
      const service = createSupabaseServiceClient();
      const authRecord = epf ? await getShalomPortalAuthRecord(service, epf) : null;
      redirect(authRecord?.needs_pin_setup ? '/shalom-front/set-pin' : '/shalom-front');
    }
  }

  const [companyLogoUrl, brandTokens] = await Promise.all([
    getCompanyLogoUrl(),
    loadExecutiveBrandTokens(),
  ]);

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <ShalomFrontLoginForm companyLogoUrl={companyLogoUrl} authError={authError} />
    </ExecutiveBrandThemeProvider>
  );
}
