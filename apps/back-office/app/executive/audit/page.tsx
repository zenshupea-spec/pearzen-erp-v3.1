import { redirect } from 'next/navigation';

import AuditLedgerView from '../../../components/audit/AuditLedgerView';
import { ALL_AUDIT_TABS, auditTabsForRole } from '../../../lib/audit-portals';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';

export const dynamic = 'force-dynamic';

export default async function ExecutiveAuditPage() {
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

  if (role !== 'MD' && role !== 'OD') {
    redirect('/hq/audit');
  }

  return (
    <AuditLedgerView
      variant="executive"
      allowedTabs={ALL_AUDIT_TABS}
      defaultTab={auditTabsForRole(role)[0] ?? 'md-od'}
    />
  );
}
