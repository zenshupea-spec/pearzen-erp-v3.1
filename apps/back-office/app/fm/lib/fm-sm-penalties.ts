import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  DEFAULT_PENALTY_CATALOG,
  parsePenaltyCatalog,
  type PenaltyCatalogEntry,
} from '../../../../../packages/penalty-catalog';

export const SM_PENALTY_PAYROLL_REASON_PREFIX = 'sm_penalty:';

export type SmPenaltyDeduction = {
  penaltyId: string;
  employeeId: string;
  guardEpf: string;
  guardName: string | null;
  rank: string | null;
  siteName: string | null;
  amountLkr: number;
  catalogLabel: string;
};

export type PenaltyDeductionLedgerRow = {
  empNo: string;
  name: string;
  rank: string;
  site: string;
  amountLkr: number;
  category: 'Disciplinary' | 'Client pass-through';
  supplier: string;
  catalogLabel: string;
};

function isMissingTableError(message: string): boolean {
  return /does not exist|relation .* not found|42P01/i.test(message);
}

function payrollMonthBounds(year: number, month: number): { start: string; end: string; appliedMonth: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
  return { start, end, appliedMonth: start };
}

export function smPenaltyPayrollReason(penaltyId: string, catalogLabel: string): string {
  return `${SM_PENALTY_PAYROLL_REASON_PREFIX}${penaltyId}|${catalogLabel}`;
}

export function parseSmPenaltyPayrollReason(
  reason: string | null | undefined,
): { penaltyId: string; catalogLabel: string } | null {
  if (!reason?.startsWith(SM_PENALTY_PAYROLL_REASON_PREFIX)) return null;
  const payload = reason.slice(SM_PENALTY_PAYROLL_REASON_PREFIX.length);
  const pipe = payload.indexOf('|');
  if (pipe <= 0) return null;
  return {
    penaltyId: payload.slice(0, pipe),
    catalogLabel: payload.slice(pipe + 1),
  };
}

export function resolveSmPenaltyCatalogLabel(
  penaltyType: string | null | undefined,
  penaltyCatalogId: string | null | undefined,
  catalog: PenaltyCatalogEntry[] = DEFAULT_PENALTY_CATALOG,
): string {
  const ids = String(penaltyCatalogId ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length > 0) {
    const labels = ids
      .map((id) => catalog.find((entry) => entry.id === id)?.offense)
      .filter((label): label is string => Boolean(label));
    if (labels.length > 0) return labels.join('; ');
  }
  const type = String(penaltyType ?? '').trim();
  if (type && !type.includes('Disciplinary penalty')) return type;
  return 'Disciplinary penalty';
}

async function loadPenaltyCatalog(companyId: string): Promise<PenaltyCatalogEntry[]> {
  const db = createSupabaseServiceClient();
  const { data } = await db
    .from('md_settings')
    .select('penalty_catalog')
    .eq('company_id', companyId)
    .maybeSingle();
  return parsePenaltyCatalog((data as { penalty_catalog?: unknown } | null)?.penalty_catalog);
}

export async function fetchApprovedSmPenaltiesForPayrollMonth(
  companyId: string,
  year: number,
  month: number,
): Promise<SmPenaltyDeduction[]> {
  const db = createSupabaseServiceClient();
  const { start, end } = payrollMonthBounds(year, month);
  const catalog = await loadPenaltyCatalog(companyId);

  const { data: employees, error: empError } = await db
    .from('employees')
    .select('id, emp_number, full_name, rank, site')
    .eq('company_id', companyId)
    .ilike('status', 'active');

  if (empError) {
    if (isMissingTableError(empError.message)) return [];
    console.error('fetchApprovedSmPenaltiesForPayrollMonth employees:', empError.message);
    return [];
  }

  const employeeByEpf = new Map<string, (typeof employees)[number]>();
  for (const emp of employees ?? []) {
    const epf = String(emp.emp_number ?? '').trim().toUpperCase();
    if (epf) employeeByEpf.set(epf, emp);
  }

  const { data: penalties, error } = await db
    .from('sm_guard_penalties')
    .select(
      'id, guard_epf, guard_name, penalty_type, penalty_catalog_id, deduction_amount, site_name, status, created_at',
    )
    .in('status', ['APPROVED', 'APPLIED'])
    .gte('created_at', start)
    .lte('created_at', end);

  if (error) {
    if (isMissingTableError(error.message)) return [];
    console.error('fetchApprovedSmPenaltiesForPayrollMonth:', error.message);
    return [];
  }

  const rows: SmPenaltyDeduction[] = [];
  for (const row of penalties ?? []) {
    const guardEpf = String(row.guard_epf ?? '').trim().toUpperCase();
    const emp = employeeByEpf.get(guardEpf);
    if (!emp) continue;
    const amountLkr = Math.max(0, Math.round(Number(row.deduction_amount ?? 0)));
    if (amountLkr <= 0) continue;
    rows.push({
      penaltyId: String(row.id),
      employeeId: String(emp.id),
      guardEpf,
      guardName: (row.guard_name as string | null) ?? emp.full_name ?? null,
      rank: emp.rank != null ? String(emp.rank) : null,
      siteName:
        (row.site_name as string | null) ??
        (emp.site != null ? String(emp.site) : null),
      amountLkr,
      catalogLabel: resolveSmPenaltyCatalogLabel(
        row.penalty_type as string | null,
        row.penalty_catalog_id as string | null,
        catalog,
      ),
    });
  }
  return rows;
}

export async function syncSmPenaltyPayrollDeductions(
  companyId: string,
  year: number,
  month: number,
  penalties: SmPenaltyDeduction[],
): Promise<void> {
  if (penalties.length === 0) return;
  const db = createSupabaseServiceClient();
  const { appliedMonth } = payrollMonthBounds(year, month);

  const { data: existing, error: existingError } = await db
    .from('payroll_deductions')
    .select('id, reason')
    .eq('company_id', companyId)
    .eq('category', 'DISCIPLINARY')
    .eq('applied_month', appliedMonth);

  if (existingError && !isMissingTableError(existingError.message)) {
    console.error('syncSmPenaltyPayrollDeductions read:', existingError.message);
    return;
  }

  const existingPenaltyIds = new Set(
    (existing ?? [])
      .map((row) => parseSmPenaltyPayrollReason(row.reason as string | null)?.penaltyId)
      .filter((id): id is string => Boolean(id)),
  );

  const inserts = penalties
    .filter((penalty) => !existingPenaltyIds.has(penalty.penaltyId))
    .map((penalty) => ({
      company_id: companyId,
      guard_id: penalty.employeeId,
      category: 'DISCIPLINARY' as const,
      amount: penalty.amountLkr,
      reason: smPenaltyPayrollReason(penalty.penaltyId, penalty.catalogLabel),
      applied_month: appliedMonth,
      approval_status: 'APPROVED' as const,
    }));

  if (inserts.length === 0) return;

  const { error } = await db.from('payroll_deductions').insert(inserts);
  if (error) {
    console.error('syncSmPenaltyPayrollDeductions insert:', error.message);
  }
}

export function groupSmPenaltiesByEmployee(
  penalties: SmPenaltyDeduction[],
): Map<string, SmPenaltyDeduction[]> {
  const map = new Map<string, SmPenaltyDeduction[]>();
  for (const penalty of penalties) {
    const list = map.get(penalty.employeeId) ?? [];
    list.push(penalty);
    map.set(penalty.employeeId, list);
  }
  return map;
}

export async function fetchApprovedPenaltyAmountsByEmployee(
  companyId: string,
  year: number,
  month: number,
): Promise<Map<string, number>> {
  const penalties = await fetchApprovedSmPenaltiesForPayrollMonth(companyId, year, month);
  await syncSmPenaltyPayrollDeductions(companyId, year, month, penalties);
  const map = new Map<string, number>();
  for (const penalty of penalties) {
    map.set(penalty.employeeId, (map.get(penalty.employeeId) ?? 0) + penalty.amountLkr);
  }
  return map;
}

export async function fetchPenaltyDeductionLedgerRows(
  companyId: string,
  year: number,
  month: number,
): Promise<PenaltyDeductionLedgerRow[]> {
  const penalties = await fetchApprovedSmPenaltiesForPayrollMonth(companyId, year, month);
  return penalties.map((row) => ({
    empNo: row.guardEpf,
    name: row.guardName ?? row.guardEpf,
    rank: row.rank ?? 'Guard',
    site: row.siteName ?? '—',
    amountLkr: row.amountLkr,
    category: 'Disciplinary' as const,
    supplier: 'Pearzen Security',
    catalogLabel: row.catalogLabel,
  }));
}
