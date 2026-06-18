import { redirect } from 'next/navigation';

import AuditLedgerView from '../../../components/audit/AuditLedgerView';
import {
  canAccessPortalActivityLedger,
  portalActivityTabsForRole,
} from '../../../lib/audit-portals';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';

export const dynamic = 'force-dynamic';

export default async function PortalActivityLedgerPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login/head-office');
  }

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = profile.role;

  if (!role) {
    redirect('/login/head-office?error=no_portal_rank');
  }

  if (!canAccessPortalActivityLedger(role)) {
    redirect('/dashboard');
  }

  const allowedTabs = portalActivityTabsForRole(role);

  return (
    <AuditLedgerView
      variant="portal-activity"
      allowedTabs={allowedTabs}
      defaultTab={allowedTabs[0]!}
    />
  );
}
