'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { auditStaffAction } from '../../lib/staff-audit';
import { isAdvanceWorkflowGroup } from '../../lib/advance-run-types';
import { upsertAdvanceRunTotals } from './advance-run-actions';
import { validateAdvanceRowsForPeriod } from './lib/fm-advance-validation';
import type { PayrollPeriod } from './lib/payroll-period';

export type FmAdvanceSelectionRecord = {
  id: string;
  profileId: string;
  empNumber: string;
  amount: number;
};

export type FmAdvanceSelectionInput = {
  profileId: string;
  empNumber: string;
  amount: number;
};

async function resolveFmCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

export async function getFmAdvanceSelections(
  period: PayrollPeriod,
): Promise<FmAdvanceSelectionRecord[]> {
  const companyId = await resolveFmCompanyId();
  if (!companyId) return [];

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('salary_advances')
    .select('id, profile_id, emp_number, amount')
    .eq('company_id', companyId)
    .eq('period_year', period.year)
    .eq('period_month', period.month)
    .in('status', ['DRAFT', 'SUBMITTED', 'APPROVED']);

  if (error) {
    if (error.code === '42P01') return [];
    console.error('getFmAdvanceSelections:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    profileId: String(row.profile_id),
    empNumber: String(row.emp_number ?? ''),
    amount: Number(row.amount ?? 0),
  }));
}

export async function saveFmAdvanceSelections(input: {
  period: PayrollPeriod;
  payrollGroup?: string;
  selections: FmAdvanceSelectionInput[];
  eligibleProfileIds: string[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const companyId = await resolveFmCompanyId();
  if (!companyId) return { success: false, error: 'No company context' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const db = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const eligible = new Set(input.eligibleProfileIds);
  const selectedIds = new Set(input.selections.map((row) => row.profileId));
  const payrollGroup = input.payrollGroup ?? null;

  if (payrollGroup && isAdvanceWorkflowGroup(payrollGroup)) {
    const { data: run } = await db
      .from('advance_runs')
      .select('status')
      .eq('company_id', companyId)
      .eq('period_year', input.period.year)
      .eq('period_month', input.period.month)
      .eq('group_id', payrollGroup)
      .maybeSingle();

    if (run && run.status !== 'DRAFT') {
      return {
        success: false,
        error: 'This batch is with MD or already approved. Re-edit to change selections.',
      };
    }
  }

  for (const profileId of eligible) {
    if (selectedIds.has(profileId)) continue;
    const { error } = await db
      .from('salary_advances')
      .delete()
      .eq('company_id', companyId)
      .eq('profile_id', profileId)
      .eq('period_year', input.period.year)
      .eq('period_month', input.period.month)
      .in('status', ['DRAFT', 'SUBMITTED']);
    if (error && error.code !== '42P01') {
      return { success: false, error: error.message };
    }
  }

  const normalizedSelections = input.selections.map((row) => ({
    profileId: row.profileId,
    empNumber: row.empNumber,
    amount: Math.max(1, Math.round(Number(row.amount) || 0)),
    payrollGroup,
  }));

  const validation = await validateAdvanceRowsForPeriod(
    companyId,
    input.period.year,
    input.period.month,
    normalizedSelections.map((row) => ({
      profileId: row.profileId,
      amount: row.amount,
      payrollGroup: row.payrollGroup,
    })),
  );
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  for (const row of normalizedSelections) {
    const { error } = await db.from('salary_advances').upsert(
      {
        company_id: companyId,
        profile_id: row.profileId,
        emp_number: row.empNumber,
        amount: row.amount,
        period_year: input.period.year,
        period_month: input.period.month,
        payroll_group: payrollGroup,
        status: 'DRAFT',
        reason: 'FM advance salary desk',
        approved_by: null,
        created_by: user?.id ?? null,
        updated_at: nowIso,
      },
      { onConflict: 'company_id,profile_id,period_year,period_month' },
    );
    if (error) {
      if (error.code === '42P01') {
        return { success: false, error: 'salary_advances table is not migrated yet.' };
      }
      return { success: false, error: error.message };
    }
  }

  if (payrollGroup && isAdvanceWorkflowGroup(payrollGroup)) {
    const totalAmount = normalizedSelections.reduce((sum, row) => sum + row.amount, 0);
    await upsertAdvanceRunTotals(
      payrollGroup,
      input.period.year,
      input.period.month,
      input.selections.length,
      totalAmount,
    );
  }

  await auditStaffAction({
    supabase,
    portal: 'fm',
    action: 'Save Advance Salary Selections',
    targetEntity: `${input.period.year}-${String(input.period.month).padStart(2, '0')}`,
    details: {
      payrollGroup: input.payrollGroup,
      selectedCount: input.selections.length,
    },
  });

  revalidatePath('/fm/advance');
  revalidatePath('/fm');
  revalidatePath('/fm/roster');
  return { success: true };
}
