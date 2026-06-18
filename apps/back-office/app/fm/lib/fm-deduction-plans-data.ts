import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  mapPlanRow,
  type FmEmployeeDeductionPlanRow,
} from './fm-employee-deduction-plans';

function isMissingTableError(message: string): boolean {
  return /does not exist|relation .* not found|42P01/i.test(message);
}

export async function fetchHqMonthlyDeductions(
  companyId: string,
  payrollMonth: string,
): Promise<Map<string, { meals: number; uniform: number }>> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('payroll_monthly_deduction_entries')
    .select('employee_id, meals_amount_lkr, uniform_amount_lkr')
    .eq('company_id', companyId)
    .eq('payroll_month', payrollMonth);

  if (error) {
    if (isMissingTableError(error.message)) return new Map();
    console.error('fetchHqMonthlyDeductions:', error.message);
    return new Map();
  }

  const map = new Map<string, { meals: number; uniform: number }>();
  for (const row of data ?? []) {
    map.set(String(row.employee_id), {
      meals: Number(row.meals_amount_lkr ?? 0),
      uniform: Number(row.uniform_amount_lkr ?? 0),
    });
  }
  return map;
}

export async function fetchApprovedSalaryAdvances(
  companyId: string,
  year: number,
  month: number,
): Promise<Map<string, number>> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('salary_advances')
    .select('profile_id, amount')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('status', 'APPROVED');

  if (error) {
    if (error.code === '42P01') return new Map();
    console.error('fetchApprovedSalaryAdvances:', error.message);
    return new Map();
  }

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(String(row.profile_id), Number(row.amount ?? 0));
  }
  return map;
}

export async function fetchActiveFmDeductionPlans(
  companyId: string,
  employeeIds?: string[],
): Promise<Map<string, FmEmployeeDeductionPlanRow[]>> {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from('fm_employee_deduction_plans')
    .select(
      'id, employee_id, deduction_kind, total_liability_lkr, installment_total, start_payroll_month, status, notes',
    )
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');

  if (employeeIds?.length) {
    query = query.in('employee_id', employeeIds);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error.message)) return new Map();
    console.error('fetchActiveFmDeductionPlans:', error.message);
    return new Map();
  }

  const map = new Map<string, FmEmployeeDeductionPlanRow[]>();
  for (const row of data ?? []) {
    const plan = mapPlanRow(row as Record<string, unknown>);
    const list = map.get(plan.employeeId) ?? [];
    list.push(plan);
    map.set(plan.employeeId, list);
  }
  return map;
}
