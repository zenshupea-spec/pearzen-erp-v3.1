import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  normalizeSmEpf,
  sectorManagerEpfKey,
  smVisitLookupKeys,
} from '../../../../../packages/supabase/sm-epf';

export type SmVisitEmployeeRow = {
  id: string;
  emp_number?: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
};

async function fetchSmPortalAuthEpfs(canonicalEpfs: string[]): Promise<Map<string, string>> {
  const portalAuthByCanonical = new Map<string, string>();
  if (canonicalEpfs.length === 0) return portalAuthByCanonical;

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('sm_portal_auth')
    .select('epf_number')
    .in('epf_number', canonicalEpfs);

  for (const row of data ?? []) {
    const portalEpf = normalizeSmEpf(row.epf_number);
    if (portalEpf) portalAuthByCanonical.set(portalEpf, portalEpf);
  }
  return portalAuthByCanonical;
}

function resolveEmployeeIdForLogEpf(
  logEpf: string,
  smEmployees: SmVisitEmployeeRow[],
  portalAuthByCanonical: Map<string, string>,
): string | null {
  for (const emp of smEmployees) {
    const canonical = sectorManagerEpfKey(emp);
    const portalAuthEpf = canonical ? portalAuthByCanonical.get(canonical) ?? canonical : null;
    if (smVisitLookupKeys(emp, portalAuthEpf).includes(logEpf)) {
      return emp.id;
    }
  }

  // Legacy visit rows may use pre-canonical demo keys when only one SM is active.
  if (smEmployees.length === 1) {
    return smEmployees[0]!.id;
  }

  return null;
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

function isDateInPayrollMonth(isoDate: string, start: string, end: string): boolean {
  return isoDate >= start && isoDate <= end;
}

/** Count SM visits per employee id for a payroll month (canonical sm_epf join). */
export async function fetchSmVisitCountsByEmployeeId(
  companyId: string,
  payrollMonth: string,
  smEmployees: SmVisitEmployeeRow[],
): Promise<Map<string, number>> {
  const [year, month] = payrollMonth.split('-').map(Number);
  const start = `${payrollMonth}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  const supabase = createSupabaseServiceClient();

  const { data: visitRows } = await supabase
    .from('sm_visit_logs')
    .select('sm_epf, visit_date, created_at')
    .eq('company_id', companyId)
    .eq('visit_type', 'VISIT');

  const canonicalEpfs = smEmployees
    .map((emp) => sectorManagerEpfKey(emp))
    .filter((epf): epf is string => Boolean(epf));
  const portalAuthByCanonical = await fetchSmPortalAuthEpfs(canonicalEpfs);

  const countsByEmployeeId = new Map<string, number>();

  for (const row of visitRows ?? []) {
    const effectiveDate = effectiveVisitDate(row);
    if (!effectiveDate || !isDateInPayrollMonth(effectiveDate, start, end)) continue;

    const logEpf = normalizeSmEpf(row.sm_epf);
    if (!logEpf) continue;

    const employeeId = resolveEmployeeIdForLogEpf(logEpf, smEmployees, portalAuthByCanonical);
    if (!employeeId) continue;

    countsByEmployeeId.set(employeeId, (countsByEmployeeId.get(employeeId) ?? 0) + 1);
  }

  return countsByEmployeeId;
}
