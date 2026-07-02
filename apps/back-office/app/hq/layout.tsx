import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import HqLayoutShell from '../../components/hq/HqLayoutShell';
import { ExecutiveBrandThemeProvider } from '../../components/executive/ExecutiveBrandTheme';
import { canAccessHqAuditRoute } from '../../lib/audit-ledger-access';
import { canAccessHqHub } from '../../lib/hq-hub';
import { loadExecutiveBrandTokens } from '../../lib/cvs-brand-tokens-server';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { loginPathForStaffPortal } from '../../lib/portal-isolation';

export default async function HQLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(loginPathForStaffPortal('hq'));
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;
  const pathname = (await headers()).get('x-pathname') ?? '';
  const isPortalActivityLedger =
    pathname === '/hq/audit' || pathname.startsWith('/hq/audit/');

  if (!role) {
    redirect(`${loginPathForStaffPortal('hq')}?error=no_portal_rank`);
  }

  if (isPortalActivityLedger) {
    if (!canAccessHqAuditRoute(profile)) {
      redirect('/dashboard');
    }
  } else if (!canAccessHqHub(role) && !profile.rbacGated) {
    redirect(`${loginPathForStaffPortal('hq')}?error=hq_denied`);
  }

  const brandTokens = await loadExecutiveBrandTokens();

  return (
    <ExecutiveBrandThemeProvider initialTokens={brandTokens}>
      <HqLayoutShell>{children}</HqLayoutShell>
    </ExecutiveBrandThemeProvider>
  );
}
