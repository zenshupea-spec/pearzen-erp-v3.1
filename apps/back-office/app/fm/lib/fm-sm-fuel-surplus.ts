import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  normalizeSmEpf,
  sectorManagerEpfKey,
  smVisitLookupKeys,
} from '../../../../../packages/supabase/sm-epf';
import {
  surplusLkrForTrip,
  type SmFuelTripRow,
} from '../../../../../packages/sm-fuel-surplus';
import type { SmVisitEmployeeRow } from './sm-visit-lookup';

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
  if (smEmployees.length === 1) {
    return smEmployees[0]!.id;
  }
  return null;
}

/** Prior-month fuel surplus (LKR) per SM employee — clawed back when `fuelSurplusCorrection` is on. */
export async function fetchPriorMonthFuelSurplusByEmployeeId(
  companyId: string,
  priorPayrollMonth: string,
  smEmployees: SmVisitEmployeeRow[],
  fuelPerKmLkr: number,
): Promise<Map<string, number>> {
  const [year, month] = priorPayrollMonth.split('-').map(Number);
  const start = `${priorPayrollMonth}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  const supabase = createSupabaseServiceClient();

  const { data: tripRows } = await supabase
    .from('sm_visit_logs')
    .select(
      'sm_epf, visit_date, created_at, visit_type, verification_status, km_claimed, route_km, fuel_amount',
    )
    .eq('company_id', companyId)
    .eq('visit_type', 'INCIDENT_TRIP');

  const canonicalEpfs = smEmployees
    .map((emp) => sectorManagerEpfKey(emp))
    .filter((epf): epf is string => Boolean(epf));
  const portalAuthByCanonical = await fetchSmPortalAuthEpfs(canonicalEpfs);

  const surplusByEmployeeId = new Map<string, number>();

  for (const row of tripRows ?? []) {
    const effectiveDate = effectiveVisitDate(row);
    if (!effectiveDate || !isDateInPayrollMonth(effectiveDate, start, end)) continue;

    const logEpf = normalizeSmEpf(row.sm_epf);
    if (!logEpf) continue;

    const employeeId = resolveEmployeeIdForLogEpf(logEpf, smEmployees, portalAuthByCanonical);
    if (!employeeId) continue;

    const trip: SmFuelTripRow = {
      verification_status: String(row.verification_status ?? 'PENDING'),
      km_claimed: row.km_claimed != null ? Number(row.km_claimed) : null,
      route_km: row.route_km != null ? Number(row.route_km) : null,
      fuel_amount: row.fuel_amount != null ? Number(row.fuel_amount) : null,
    };
    const surplus = surplusLkrForTrip(trip, fuelPerKmLkr);
    if (surplus <= 0) continue;

    surplusByEmployeeId.set(employeeId, (surplusByEmployeeId.get(employeeId) ?? 0) + surplus);
  }

  return surplusByEmployeeId;
}
