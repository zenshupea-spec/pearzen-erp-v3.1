import { redirect } from 'next/navigation';

import { getCompanyLogoUrl } from '../../../../../packages/supabase/company-branding';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveCafeEmployeeForUser } from '../../../lib/cafe-front-auth';

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
    const employee = await resolveCafeEmployeeForUser(user);
    if (employee) redirect('/cafe-front');
  }

  const logoUrl = await getCompanyLogoUrl();

  return <CafeFrontLoginForm logoUrl={logoUrl} authError={authError} />;
}
