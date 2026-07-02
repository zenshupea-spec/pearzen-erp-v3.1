import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  fetchMonthlySiteShiftRollup,
  type GuardEmpRow,
} from '../app/hq/deductions/lib/monthly-site-shifts';
import {
  payrollMonthDateRange,
  payrollMonthFirstDay,
} from '../app/hq/deductions/lib/payroll-month';
import { inferCorporatePayrollGroup } from '../app/fm/lib/payroll-earnings-display';

export type SiteMarginActivity = {
  shiftsCompleted: number;
  visitsLogged: number;
};

function siteKeyFromName(name: string): string {
  return name.trim().toLowerCase();
}

function effectiveVisitDate(row: {
  visit_date?: unknown;
  created_at?: unknown;
}): string | null {
  const rawVisitDate = row.visit_date;
  if (rawVisitDate != null && String(rawVisitDate).trim() !== '') {
    return String(rawVisitDate).slice(0, 10);
  }
  if (row.created_at) {
    return String(row.created_at).slice(0, 10);
  }
  return null;
}

function resolveAdjustmentSiteKey(
  raw: string,
  siteIdToNameKey: Map<string, string>,
): string {
  return siteIdToNameKey.get(raw) ?? siteKeyFromName(raw);
}

/** Monthly shift + SM visit counts per site profile id (AR / deductions rollup source). */
export async function fetchSiteMarginActivityBySiteId(
  companyId: string,
  payrollMonth: string,
): Promise<Map<string, SiteMarginActivity>> {
  const payrollMonthKey = payrollMonth.slice(0, 7);
  const payrollMonthIso = payrollMonthFirstDay(payrollMonthKey);
  const supabase = createSupabaseServiceClient();
  const { start, end } = payrollMonthDateRange(payrollMonthIso);

  const [{ data: siteRows }, { data: employeeRows }] = await Promise.all([
    supabase.from('site_profiles').select('id, site_name').eq('company_id', companyId),
    supabase
      .from('employees')
      .select('id, emp_number, epf_no, epf_num, group, operational_group, status')
      .eq('company_id', companyId)
      .eq('status', 'ACTIVE'),
  ]);

  const siteIdByKey = new Map<string, string>();
  const siteIdToNameKey = new Map<string, string>();
  const result = new Map<string, SiteMarginActivity>();

  for (const site of siteRows ?? []) {
    const id = String(site.id);
    const name = String(site.site_name ?? '').trim();
    if (!name) continue;
    const key = siteKeyFromName(name);
    siteIdByKey.set(key, id);
    siteIdToNameKey.set(id, key);
    result.set(id, { shiftsCompleted: 0, visitsLogged: 0 });
  }

  const guards: GuardEmpRow[] = [];
  for (const emp of employeeRows ?? []) {
    if (inferCorporatePayrollGroup(emp) !== 'GUARD_FIELD') continue;
    guards.push({
      id: String(emp.id),
      emp_number: emp.emp_number as string | null,
      epf_no: emp.epf_no as string | null,
      epf_num: emp.epf_num as number | string | null,
    });
  }

  const rollup = await fetchMonthlySiteShiftRollup(
    supabase,
    guards,
    payrollMonthIso,
    companyId,
  );

  const pairCounts = new Map<string, number>();
  for (const [siteKey, byEmployee] of rollup.shiftCountBySite) {
    for (const [employeeId, shiftCount] of byEmployee) {
      const key = `${employeeId}:${siteKey}`;
      pairCounts.set(key, shiftCount);
    }
  }

  const { data: adjRows } = await supabase
    .from('fm_shift_adjustments')
    .select('employee_id, site_key, delta_shifts')
    .eq('company_id', companyId)
    .eq('payroll_month', payrollMonthIso);

  for (const row of adjRows ?? []) {
    const siteKey = resolveAdjustmentSiteKey(String(row.site_key ?? ''), siteIdToNameKey);
    const key = `${row.employee_id}:${siteKey}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + Number(row.delta_shifts ?? 0));
  }

  for (const [key, rawCount] of pairCounts) {
    const adjusted = Math.max(0, rawCount);
    if (adjusted <= 0) continue;
    const colonIdx = key.indexOf(':');
    const siteKey = key.slice(colonIdx + 1);
    const siteId = siteIdByKey.get(siteKey);
    if (!siteId) continue;
    const existing = result.get(siteId) ?? { shiftsCompleted: 0, visitsLogged: 0 };
    existing.shiftsCompleted += adjusted;
    result.set(siteId, existing);
  }

  const { data: visitRows, error: visitError } = await supabase
    .from('sm_visit_logs')
    .select('site_name, visit_date, created_at')
    .eq('company_id', companyId)
    .eq('visit_type', 'VISIT')
    .gte('visit_date', start)
    .lte('visit_date', end);

  if (visitError) {
    console.error('❌ Site margin (sm_visit_logs):', visitError.message);
  } else {
    for (const row of visitRows ?? []) {
      const siteName = String(row.site_name ?? '').trim();
      if (!siteName) continue;
      const effectiveDate = effectiveVisitDate(row);
      if (!effectiveDate || effectiveDate < start || effectiveDate > end) continue;
      const siteId = siteIdByKey.get(siteKeyFromName(siteName));
      if (!siteId) continue;
      const existing = result.get(siteId) ?? { shiftsCompleted: 0, visitsLogged: 0 };
      existing.visitsLogged += 1;
      result.set(siteId, existing);
    }
  }

  return result;
}
