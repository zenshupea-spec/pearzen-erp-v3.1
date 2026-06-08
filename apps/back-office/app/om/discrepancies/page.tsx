import { AlertTriangle } from 'lucide-react';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import DiscrepancyDashboard from '../../../components/integrity/DiscrepancyDashboard';
import OmCommandShell from '../components/OmCommandShell';

export const dynamic = 'force-dynamic';

const DEMO_COMPANY_ID = 'demo';
const DEMO_ADMIN_ID = 'demo-admin';

export default async function OmDiscrepanciesPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let companyId: string | undefined;
  let adminId = DEMO_ADMIN_ID;
  let adminName = 'Admin';
  let isPreview = !user;

  if (user) {
    adminId = user.id;
    adminName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split('@')[0] ||
      'Admin';

    const { data: userRow } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    companyId = (userRow as { company_id?: string } | null)?.company_id;

    if (!companyId) {
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .limit(1)
        .maybeSingle();
      companyId = company?.id;
    }

    if (!companyId) {
      isPreview = true;
    }
  }

  const resolvedCompanyId = companyId ?? DEMO_COMPANY_ID;

  return (
    <OmCommandShell
      title="Integrity & discrepancies"
      subtitle="45-minute rule and overlap conflicts — trust roster vs check-in"
      icon={AlertTriangle}
      accent="amber"
      maxWidth="7xl"
      demoBanner={isPreview}
    >
      <DiscrepancyDashboard
        companyId={resolvedCompanyId}
        adminId={adminId}
        adminName={adminName}
        useDemoFallback={isPreview}
      />
    </OmCommandShell>
  );
}
