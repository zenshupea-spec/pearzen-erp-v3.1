import { redirect } from 'next/navigation';

import AuditLedgerView from '../../../components/audit/AuditLedgerView';
import { auditTabsForRole } from '../../../lib/audit-portals';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access';

export const dynamic = 'force-dynamic';

export default async function HqStaffAuditPage() {
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

  if (role === 'MD' || role === 'OD') {
    redirect('/executive/audit');
  }

  const allowedTabs = auditTabsForRole(role);
  if (allowedTabs.length === 0) {
    redirect('/dashboard');
  }

  return (
    <AuditLedgerView
      variant="staff"
      allowedTabs={allowedTabs}
      defaultTab={allowedTabs[0]!}
    />
  );
}
