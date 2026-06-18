import { AlertTriangle } from 'lucide-react';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import DiscrepancyDashboard from '../../../components/integrity/DiscrepancyDashboard';
import OmCommandShell from '../components/OmCommandShell';

export const dynamic = 'force-dynamic';

export default async function OmDiscrepanciesPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let companyId: string | undefined;
  let adminId = '';
  let adminName = 'Admin';
  const isPreview = !user;

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
  }

  return (
    <OmCommandShell
      title="Integrity & discrepancies"
      subtitle="45-minute rule and overlap conflicts — trust roster vs check-in"
      icon={AlertTriangle}
      accent="amber"
      maxWidth="7xl"
      demoBanner={isPreview || !companyId}
    >
      {companyId && adminId ? (
        <DiscrepancyDashboard
          companyId={companyId}
          adminId={adminId}
          adminName={adminName}
        />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Sign in with a company-linked account to load the live discrepancy queue.
        </p>
      )}
    </OmCommandShell>
  );
}
