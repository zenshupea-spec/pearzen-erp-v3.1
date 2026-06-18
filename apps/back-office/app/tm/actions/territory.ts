'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import { resolveCompanyIdForSession } from '../../../lib/company-context-server';
import { getSectorManagersForAssignment } from '../../om/actions/sites';

export type TmSectorManagerRollup = {
  emp_number: string;
  full_name: string;
  site_count: number;
  shortage7DayAvg: number;
  activeDeficits: number;
  disciplinary30Day: number;
  visitCompliancePct: number;
};

function normalizeSiteKey(name: string) {
  return name.trim().toLowerCase();
}

export async function getTmSectorManagerRollup(): Promise<TmSectorManagerRollup[]> {
  const managers = await getSectorManagersForAssignment();
  if (!managers.length) return [];

  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  const service = createSupabaseServiceClient();

  let siteQuery = supabase
    .from('site_profiles')
    .select('site_name, assigned_sm_epf, required_guards')
    .not('assigned_sm_epf', 'is', null);
  if (companyId) siteQuery = siteQuery.eq('company_id', companyId);
  const { data: siteRows } = await siteQuery;

  let guardQuery = supabase
    .from('employees')
    .select('site, status, group')
    .eq('status', 'ACTIVE')
    .eq('group', 'GUARD');
  if (companyId) guardQuery = guardQuery.eq('company_id', companyId);
  const { data: guardRows } = await guardQuery;

  const guardsBySite = new Map<string, number>();
  for (const guard of guardRows ?? []) {
    const key = normalizeSiteKey(String(guard.site ?? ''));
    if (!key) continue;
    guardsBySite.set(key, (guardsBySite.get(key) ?? 0) + 1);
  }

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const since7 = new Date();
  since7.setDate(since7.getDate() - 7);

  let visitQuery = service
    .from('sm_visit_logs')
    .select('sm_epf, visit_date, verification_status')
    .eq('visit_type', 'VISIT')
    .gte('visit_date', since30.toISOString().slice(0, 10));
  const { data: visitRows } = await visitQuery;

  const { data: penaltyRows } = await service
    .from('sm_guard_penalties')
    .select('sm_epf, created_at')
    .gte('created_at', since30.toISOString());

  return managers.map((manager) => {
    const smSites = (siteRows ?? []).filter(
      (site) => String(site.assigned_sm_epf ?? '') === manager.emp_number,
    );

    let activeDeficits = 0;
    for (const site of smSites) {
      const required = Math.max(1, Number(site.required_guards ?? 1));
      const deployed = guardsBySite.get(normalizeSiteKey(String(site.site_name))) ?? 0;
      activeDeficits += Math.max(0, required - deployed);
    }

    const visits = (visitRows ?? []).filter(
      (row) => String(row.sm_epf ?? '') === manager.emp_number,
    );
    const visits7 = visits.filter(
      (row) => String(row.visit_date ?? '') >= since7.toISOString().slice(0, 10),
    );
    const verified = visits.filter(
      (row) => String(row.verification_status ?? '').toUpperCase() === 'VERIFIED',
    ).length;
    const visitCompliancePct = visits.length
      ? Math.round((verified / visits.length) * 100)
      : 100;

    const disciplinary30Day = (penaltyRows ?? []).filter(
      (row) => String(row.sm_epf ?? '') === manager.emp_number,
    ).length;

    const shortage7DayAvg =
      smSites.length > 0
        ? Number((activeDeficits / Math.max(1, visits7.length || 1)).toFixed(1))
        : 0;

    return {
      emp_number: manager.emp_number,
      full_name: manager.full_name,
      site_count: manager.site_count,
      shortage7DayAvg,
      activeDeficits,
      disciplinary30Day,
      visitCompliancePct,
    };
  });
}
