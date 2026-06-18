'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import {
  buildFmAuditRows,
  computeInstallmentSchedule,
  fmGranularDeductionKind,
  payrollMonthDate,
  type FmDeductionAuditRow,
  type FmEmployeeDeductionPlanRow,
  type FmGranularDeductionLabel,
} from './lib/fm-employee-deduction-plans';
import {
  fetchActiveFmDeductionPlans,
  fetchApprovedSalaryAdvances,
  fetchHqMonthlyDeductions,
} from './lib/fm-deduction-plans-data';
import type { PayrollPeriod } from './lib/payroll-period';

function isMissingTableError(message: string): boolean {
  return /does not exist|relation .* not found|42P01/i.test(message);
}

export async function getEmployeeDeductionAudit(input: {
  employeeId: string;
  payrollPeriod: PayrollPeriod;
}): Promise<{
  rows: FmDeductionAuditRow[];
  totalThisMonth: number;
  tableReady: boolean;
}> {
  const companyId = await resolveCompanyIdForSession(await createSupabaseServerClient());
  if (!companyId) {
    return { rows: [], totalThisMonth: 0, tableReady: false };
  }

  const payrollMonth = payrollMonthDate(input.payrollPeriod);
  const [hqByEmployee, advancesByProfile, plansByEmployee] = await Promise.all([
    fetchHqMonthlyDeductions(companyId, payrollMonth),
    fetchApprovedSalaryAdvances(
      companyId,
      input.payrollPeriod.year,
      input.payrollPeriod.month,
    ),
    fetchActiveFmDeductionPlans(companyId, [input.employeeId]),
  ]);

  const hq = hqByEmployee.get(input.employeeId);
  const rows = buildFmAuditRows(
    input.payrollPeriod,
    hq?.meals ?? 0,
    hq?.uniform ?? 0,
    advancesByProfile.get(input.employeeId) ?? 0,
    plansByEmployee.get(input.employeeId) ?? [],
  );

  return {
    rows,
    totalThisMonth: rows.reduce((sum, row) => sum + row.thisMonthAmount, 0),
    tableReady: true,
  };
}

export async function saveFmEmployeeDeductionPlan(input: {
  employeeId: string;
  payrollPeriod: PayrollPeriod;
  deductionLabel: FmGranularDeductionLabel;
  totalLiabilityLkr: number;
  installmentTotal: number;
  notes?: string;
  cancel?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { success: false, error: 'Company context required.' };

  const db = createSupabaseServiceClient();
  const deductionKind = fmGranularDeductionKind(input.deductionLabel);
  const payrollMonth = payrollMonthDate(input.payrollPeriod);
  const now = new Date().toISOString();

  if (input.cancel) {
    const { error } = await db
      .from('fm_employee_deduction_plans')
      .update({ status: 'CANCELLED', updated_at: now })
      .eq('company_id', companyId)
      .eq('employee_id', input.employeeId)
      .eq('deduction_kind', deductionKind)
      .eq('status', 'ACTIVE');
    if (error) {
      if (isMissingTableError(error.message)) {
        return { success: false, error: 'Run npm run db:apply-fm-deduction-plans first.' };
      }
      return { success: false, error: error.message };
    }
    revalidatePath('/fm');
    return { success: true };
  }

  const total = Math.round(Math.max(0, input.totalLiabilityLkr));
  const installments = Math.max(1, Math.floor(input.installmentTotal));

  if (total <= 0) {
    return saveFmEmployeeDeductionPlan({ ...input, cancel: true });
  }

  const { data: existing, error: fetchError } = await db
    .from('fm_employee_deduction_plans')
    .select('id, start_payroll_month')
    .eq('company_id', companyId)
    .eq('employee_id', input.employeeId)
    .eq('deduction_kind', deductionKind)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (fetchError) {
    if (isMissingTableError(fetchError.message)) {
      return { success: false, error: 'Run npm run db:apply-fm-deduction-plans first.' };
    }
    return { success: false, error: fetchError.message };
  }

  const row = {
    company_id: companyId,
    employee_id: input.employeeId,
    deduction_kind: deductionKind,
    total_liability_lkr: total,
    installment_total: installments,
    start_payroll_month: existing?.start_payroll_month ?? payrollMonth,
    status: 'ACTIVE',
    notes: input.notes?.trim() || null,
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await db
      .from('fm_employee_deduction_plans')
      .update(row)
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await db.from('fm_employee_deduction_plans').insert(row);
    if (error) return { success: false, error: error.message };
  }

  const planRow: FmEmployeeDeductionPlanRow = {
    id: String(existing?.id ?? ''),
    employeeId: input.employeeId,
    deductionKind,
    totalLiabilityLkr: total,
    installmentTotal: installments,
    startPayrollMonth: String(existing?.start_payroll_month ?? payrollMonth).slice(0, 10),
    status: 'ACTIVE',
    notes: input.notes?.trim() || null,
  };
  const schedule = computeInstallmentSchedule(planRow, input.payrollPeriod);
  if (schedule?.completed) {
    await db
      .from('fm_employee_deduction_plans')
      .update({ status: 'COMPLETED', updated_at: now })
      .eq('company_id', companyId)
      .eq('employee_id', input.employeeId)
      .eq('deduction_kind', deductionKind)
      .eq('status', 'ACTIVE');
  }

  revalidatePath('/fm');
  return { success: true };
}
