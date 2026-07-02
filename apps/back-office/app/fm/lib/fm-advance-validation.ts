import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  getAdvanceSalarySettings,
} from '../../executive/settings/advance-salary-actions';
import {
  validateAdvanceAmount,
  type AdvanceSalarySettings,
  type AdvanceValidationResult,
} from '../../../../../packages/advance-salary';
import { normalizeCorporatePayrollGroup } from './payroll-earnings-display';
import { isGuardPayrollCohort } from './guard-payroll-cohorts';

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

function payrollMonthRange(year: number, month: number): { start: string; end: string } {
  const payrollMonth = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${payrollMonth}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  return { start, end };
}

export async function fetchEmployeeShiftTotalsForPeriod(
  companyId: string,
  year: number,
  month: number,
): Promise<Map<string, number>> {
  const db = createSupabaseServiceClient();
  const { start, end } = payrollMonthRange(year, month);
  const { data, error } = await db
    .from('time_shifts')
    .select('employee_id')
    .eq('company_id', companyId)
    .eq('verification_status', 'VERIFIED')
    .gte('shift_date', start)
    .lte('shift_date', end);

  if (error) return new Map();

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const employeeId = String(row.employee_id);
    totals.set(employeeId, (totals.get(employeeId) ?? 0) + 1);
  }
  return totals;
}

export function resolveAdvanceEmployeeIsGuard(
  employeeGroup: unknown,
  payrollGroup?: string | null,
): boolean {
  if (payrollGroup && isGuardPayrollCohort(payrollGroup)) return true;
  return normalizeCorporatePayrollGroup(employeeGroup) === 'GUARD_FIELD';
}

export async function validateAdvanceForProfile(
  db: SupabaseServiceClient,
  companyId: string,
  profileId: string,
  amount: number,
  year: number,
  month: number,
  payrollGroup?: string | null,
  settings?: AdvanceSalarySettings,
  shiftTotals?: Map<string, number>,
): Promise<AdvanceValidationResult> {
  const resolvedSettings = settings ?? (await getAdvanceSalarySettings());

  const { data: employee, error } = await db
    .from('employees')
    .select('id, full_name, emp_number, group, basic_salary, base_salary')
    .eq('company_id', companyId)
    .eq('id', profileId)
    .maybeSingle();

  if (error || !employee) {
    return { ok: false, error: 'Employee not found for advance validation.' };
  }

  const isGuard = resolveAdvanceEmployeeIsGuard(employee.group, payrollGroup);
  const shiftsMap = shiftTotals ?? (await fetchEmployeeShiftTotalsForPeriod(companyId, year, month));
  const shiftsWorked = shiftsMap.get(profileId) ?? 0;
  const result = validateAdvanceAmount({
    amount,
    isGuard,
    shiftsWorked,
    settings: resolvedSettings,
  });

  if (!result.ok) {
    const label = employee.full_name ?? employee.emp_number ?? profileId;
    return { ok: false, error: `${label}: ${result.error}` };
  }

  // Salary advances are early disbursements — not voluntary payroll deductions.
  // The 5% basic cap applies to fines/meals/plans at month-end, not advance selection.
  return { ok: true };
}

export async function validateAdvanceRowsForPeriod(
  companyId: string,
  year: number,
  month: number,
  rows: { profileId: string; amount: number; payrollGroup?: string | null }[],
): Promise<AdvanceValidationResult> {
  if (rows.length === 0) return { ok: true };

  const db = createSupabaseServiceClient();
  const settings = await getAdvanceSalarySettings();
  const shiftTotals = await fetchEmployeeShiftTotalsForPeriod(companyId, year, month);

  for (const row of rows) {
    const result = await validateAdvanceForProfile(
      db,
      companyId,
      row.profileId,
      row.amount,
      year,
      month,
      row.payrollGroup ?? null,
      settings,
      shiftTotals,
    );
    if (!result.ok) return result;
  }

  return { ok: true };
}

export async function validateSalaryAdvanceRecord(
  companyId: string,
  advanceId: string,
): Promise<AdvanceValidationResult> {
  const db = createSupabaseServiceClient();
  const { data: advance, error } = await db
    .from('salary_advances')
    .select('id, profile_id, amount, period_year, period_month, payroll_group, company_id, status')
    .eq('id', advanceId)
    .maybeSingle();

  if (error || !advance) {
    return { ok: false, error: 'Advance request not found.' };
  }

  if (String(advance.company_id) !== companyId) {
    return { ok: false, error: 'Advance request is outside your company scope.' };
  }

  if (advance.status === 'REJECTED') {
    return { ok: false, error: 'Advance request was already rejected.' };
  }

  return validateAdvanceRowsForPeriod(companyId, Number(advance.period_year), Number(advance.period_month), [
    {
      profileId: String(advance.profile_id),
      amount: Number(advance.amount ?? 0),
      payrollGroup: advance.payroll_group != null ? String(advance.payroll_group) : null,
    },
  ]);
}
