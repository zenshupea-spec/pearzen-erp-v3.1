import { AlertTriangle } from 'lucide-react';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import DiscrepancyDashboard from '../../../components/integrity/DiscrepancyDashboard';
import OmCommandShell from '../components/OmCommandShell';

export const dynamic = 'force-dynamic';

export default async function OmDiscrepanciesPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let companyId: string | undefined;
  const isPreview = !user;

  if (user) {
    companyId = (await resolveCompanyIdForSession(supabase)) ?? undefined;
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
      {companyId ? (
        <DiscrepancyDashboard companyId={companyId} />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Sign in with a company-linked account to load the live discrepancy queue.
        </p>
      )}
    </OmCommandShell>
  );
}
