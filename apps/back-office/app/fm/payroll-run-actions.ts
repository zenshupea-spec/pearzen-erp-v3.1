'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { calculateStandardDay } from '../../lib/compensation-engine';
import { completedYearsOfService } from '../../../../packages/gratuity';
import { adjustedMonthlyBasicFromRank } from '../../../../packages/rank-pay-matrix';
import { getRankPayMatrix } from '../executive/settings/rank-matrix-actions';
import { auditStaffAction } from '../../lib/staff-audit';
import {
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import { canAccessPathViaPortalRbac } from '../../../../packages/portal-rbac';
import {
  buildBatchId,
  canRegenerateRun,
  dbStatusToWorkflow,
  employeePayrollGroup,
  type PayrollBatchStatusPayload,
  type PayrollGroupId,
  type PayrollGroupWorkflow,
  type PayrollRunDbStatus,
} from '../../lib/payroll-run-types';

const PAYROLL_PATHS = ['/fm', '/fm/batch', '/executive/payroll'] as const;

function revalidatePayrollPaths() {
  for (const path of PAYROLL_PATHS) revalidatePath(path);
}

function isMissingPayrollTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || /payroll_runs|payslips/i.test(error.message ?? '');
}

function calculateStatutory(grossPay: number) {
  return {
    epf_employee_8: Number((grossPay * 0.08).toFixed(2)),
    epf_employer_12: Number((grossPay * 0.12).toFixed(2)),
    etf_employer_3: Number((grossPay * 0.03).toFixed(2)),
  };
}

async function resolveFmCompanyId() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return { supabase, companyId: rosterCompanyId(sessionCompanyId) };
}

function canPerformFmPayrollWrite(profile: BackOfficeUserProfile): boolean {
  const role = normalizePortalRole(profile.role);
  if (role === 'FM' || role === 'MD' || role === 'OD') return true;
  if (profile.rbacGated) {
    return canAccessPathViaPortalRbac('/fm', profile.portalRbac ?? undefined, {
      writeRequired: true,
    });
  }
  return false;
}

async function requireFmRole(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canPerformFmPayrollWrite(profile)) throw new Error('Forbidden');
  return user;
}

async function requireMdRole(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (role !== 'MD' && role !== 'OD') throw new Error('Forbidden');
  return user;
}

function defaultRuns(year: number, month: number): PayrollGroupWorkflow[] {
  return (['security', 'cafe'] as PayrollGroupId[]).map((groupId) => ({
    groupId,
    batchId: buildBatchId(year, month, groupId),
    status: 'DRAFT' as const,
  }));
}

function rowToWorkflow(row: Record<string, unknown>): PayrollGroupWorkflow {
  const groupId = row.group_id as PayrollGroupId;
  const dbStatus = row.status as PayrollRunDbStatus;
  return {
    groupId,
    batchId: String(row.batch_id),
    status: dbStatusToWorkflow(dbStatus),
    submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    paidAt: row.paid_at ? String(row.paid_at) : undefined,
    payslipCount: Number(row.payslip_count ?? 0),
    grossTotal: Number(row.gross_total ?? 0),
    netTotal: Number(row.net_total ?? 0),
  };
}

export async function getPayrollBatchStatus(
  year: number,
  month: number,
): Promise<PayrollBatchStatusPayload> {
  const { companyId } = await resolveFmCompanyId();
  const defaults = defaultRuns(year, month);

  if (!companyId) {
    return { tableReady: false, periodYear: year, periodMonth: month, generated: false, runs: defaults };
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('payroll_runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month);

  if (isMissingPayrollTable(error)) {
    return { tableReady: false, periodYear: year, periodMonth: month, generated: false, runs: defaults };
  }

  if (error) {
    console.error('getPayrollBatchStatus:', error.message);
    return { tableReady: false, periodYear: year, periodMonth: month, generated: false, runs: defaults };
  }

  const runs = defaults.map((def) => {
    const row = (data ?? []).find((r) => r.group_id === def.groupId);
    return row ? rowToWorkflow(row as Record<string, unknown>) : def;
  });

  const generated = runs.some((r) => (r.payslipCount ?? 0) > 0);

  return { tableReady: true, periodYear: year, periodMonth: month, generated, runs };
}

export type GeneratePayrollResult = {
  success: boolean;
  count?: number;
  error?: string;
  blocked?: boolean;
  blockedGroups?: PayrollGroupId[];
};

export async function generateMonthEndPayrollForPeriod(
  year: number,
  month: number,
): Promise<GeneratePayrollResult> {
  try {
    const { supabase, companyId } = await resolveFmCompanyId();
    await requireFmRole(supabase);

    if (!companyId) {
      return { success: false, error: 'No company context for payroll generation.' };
    }

    const db = createSupabaseServiceClient();

  const { data: existingRuns, error: runsError } = await db
    .from('payroll_runs')
    .select('group_id, status')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month);

  if (isMissingPayrollTable(runsError)) {
    return {
      success: false,
      error: 'Payroll tables not ready. Run: npm run db:apply-payroll-runs',
      blocked: true,
    };
  }

  const lockedGroups = new Set(
    (existingRuns ?? [])
      .filter((r) => !canRegenerateRun(r.status as PayrollRunDbStatus))
      .map((r) => r.group_id as PayrollGroupId),
  );

  if (lockedGroups.size === 2) {
    return {
      success: false,
      blocked: true,
      blockedGroups: [...lockedGroups],
      error: `Payroll for ${year}-${String(month).padStart(2, '0')} is fully submitted or approved. Re-edit batches from the batch desk to regenerate.`,
    };
  }

  let query = db.from('employees').select('*').ilike('status', 'active');
  query = query.eq('company_id', companyId);

  const { data: employees, error: empError } = await query;
  if (empError) {
    return { success: false, error: empError.message };
  }

  const rankMatrix = await getRankPayMatrix();
  const periodEndIso = `${year}-${String(month).padStart(2, '0')}-28`;
  const runIds = new Map<PayrollGroupId, string>();
  const runTotals = new Map<PayrollGroupId, { count: number; gross: number; net: number }>();

  for (const groupId of ['security', 'cafe'] as PayrollGroupId[]) {
    if (lockedGroups.has(groupId)) continue;

    const batchId = buildBatchId(year, month, groupId);
    const { data: runRow, error: runError } = await db
      .from('payroll_runs')
      .upsert(
        {
          company_id: companyId,
          period_year: year,
          period_month: month,
          group_id: groupId,
          batch_id: batchId,
          status: 'DRAFT',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,period_year,period_month,group_id' },
      )
      .select('id')
      .single();

    if (runError) {
      return { success: false, error: runError.message };
    }
    runIds.set(groupId, runRow.id);
    runTotals.set(groupId, { count: 0, gross: 0, net: 0 });
  }

  let processedCount = 0;
  const nowIso = new Date().toISOString();

  for (const emp of employees ?? []) {
    const row = emp as Record<string, unknown>;
    const groupId = employeePayrollGroup(row.group);
    if (lockedGroups.has(groupId)) continue;

    const runId = runIds.get(groupId);
    if (!runId) continue;

    if (Boolean(row.requires_md_approval)) continue;

    const rank = row.rank != null ? String(row.rank) : null;
    const years = completedYearsOfService(
      row.date_joined != null ? String(row.date_joined) : null,
      periodEndIso,
    );
    const recordedBasic =
      row.basic_salary != null
        ? Number(row.basic_salary)
        : row.base_salary != null
          ? Number(row.base_salary)
          : null;

    const B = adjustedMonthlyBasicFromRank(rankMatrix, rank, years, recordedBasic);
    const grossPay = calculateStandardDay(B).grossPay * 20;

    const { data: advances } = await db
      .from('salary_advances')
      .select('amount')
      .eq('profile_id', emp.id)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('status', 'APPROVED');

    const totalAdvances = advances?.reduce((sum, adv) => sum + Number(adv.amount), 0) || 0;
    const statutory = calculateStatutory(grossPay);
    const netPay = grossPay - statutory.epf_employee_8 - totalAdvances;

    const { error: upsertError } = await db.from('payslips').upsert(
      {
        profile_id: emp.id,
        company_id: emp.company_id ?? companyId,
        payroll_run_id: runId,
        period_month: month,
        period_year: year,
        adjusted_basic: B,
        gross_pay: grossPay,
        net_pay: netPay,
        epf_employee: statutory.epf_employee_8,
        epf_employer: statutory.epf_employer_12,
        etf: statutory.etf_employer_3,
        status: 'DRAFT',
        updated_at: nowIso,
      },
      { onConflict: 'profile_id,company_id,period_year,period_month' },
    );

    if (upsertError) {
      console.error(`Payslip upsert failed for ${row.emp_number ?? emp.id}:`, upsertError.message);
      continue;
    }

    processedCount++;
    const totals = runTotals.get(groupId)!;
    totals.count += 1;
    totals.gross += grossPay;
    totals.net += netPay;
    runTotals.set(groupId, totals);
  }

  for (const [groupId, totals] of runTotals) {
    const runId = runIds.get(groupId);
    if (!runId) continue;
    await db
      .from('payroll_runs')
      .update({
        payslip_count: totals.count,
        gross_total: Number(totals.gross.toFixed(2)),
        net_total: Number(totals.net.toFixed(2)),
        updated_at: nowIso,
      })
      .eq('id', runId);
  }

  await auditStaffAction({
    supabase,
    portal: 'fm',
    action: 'Generate Month-End Payroll',
    targetEntity: `${year}-${String(month).padStart(2, '0')}`,
    details: { month, year, processedCount },
  });

    revalidatePayrollPaths();
    return { success: true, count: processedCount };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Payroll generation failed',
    };
  }
}

async function updateRunStatus(
  groupId: PayrollGroupId,
  year: number,
  month: number,
  nextStatus: PayrollRunDbStatus,
  actorField: 'submitted_by' | 'approved_by' | 'paid_by',
  timestampField: 'submitted_at' | 'approved_at' | 'paid_at',
  actorId: string,
) {
  const { companyId } = await resolveFmCompanyId();
  if (!companyId) throw new Error('No company context');

  const db = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  const { data: run, error: fetchError } = await db
    .from('payroll_runs')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('group_id', groupId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!run) throw new Error('Payroll run not found. Generate payroll first.');

  const { error: runError } = await db
    .from('payroll_runs')
    .update({
      status: nextStatus,
      [actorField]: actorId,
      [timestampField]: nowIso,
      updated_at: nowIso,
    })
    .eq('id', run.id);

  if (runError) throw new Error(runError.message);

  const payslipStatus =
    nextStatus === 'DRAFT'
      ? 'DRAFT'
      : nextStatus === 'SUBMITTED'
        ? 'SUBMITTED'
        : nextStatus === 'APPROVED' || nextStatus === 'PAID'
          ? 'APPROVED'
          : 'DRAFT';

  await db
    .from('payslips')
    .update({ status: payslipStatus, updated_at: nowIso })
    .eq('payroll_run_id', run.id);

  revalidatePayrollPaths();
}

export async function submitPayrollGroupForReview(
  groupId: PayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await resolveFmCompanyId();
    const user = await requireFmRole(supabase);
    const db = createSupabaseServiceClient();
    const { companyId } = await resolveFmCompanyId();

    const { data: run } = await db
      .from('payroll_runs')
      .select('id, status, payslip_count')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Generate payroll before submitting for MD review.' };
    if (run.status !== 'DRAFT') {
      return { success: false, error: 'This batch is already submitted or approved.' };
    }
    if ((run.payslip_count ?? 0) === 0) {
      return { success: false, error: 'No payslips in this batch. Generate payroll first.' };
    }

    await updateRunStatus(groupId, year, month, 'SUBMITTED', 'submitted_by', 'submitted_at', user.id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Submit failed' };
  }
}

export async function revertPayrollGroupToDraft(
  groupId: PayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await resolveFmCompanyId();
    await requireFmRole(supabase);
    const db = createSupabaseServiceClient();
    const { companyId } = await resolveFmCompanyId();

    const { data: run } = await db
      .from('payroll_runs')
      .select('status')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Payroll run not found.' };
    if (run.status === 'PAID') {
      return { success: false, error: 'Cannot re-edit a batch that has been marked as paid.' };
    }

    const nowIso = new Date().toISOString();
    const { data: runRow } = await db
      .from('payroll_runs')
      .select('id')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .single();

    if (runRow) {
      await db
        .from('payroll_runs')
        .update({
          status: 'DRAFT',
          submitted_at: null,
          submitted_by: null,
          approved_at: null,
          approved_by: null,
          paid_at: null,
          paid_by: null,
          updated_at: nowIso,
        })
        .eq('id', runRow.id);

      await db
        .from('payslips')
        .update({ status: 'DRAFT', updated_at: nowIso })
        .eq('payroll_run_id', runRow.id);
    }

    revalidatePayrollPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Revert failed' };
  }
}

export async function approvePayrollGroupRun(
  groupId: PayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await requireMdRole(supabase);
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);
    if (!companyId) return { success: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: run } = await db
      .from('payroll_runs')
      .select('status')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Batch not found on MD desk.' };
    if (run.status !== 'SUBMITTED') {
      return { success: false, error: 'Only submitted batches can be approved.' };
    }

    await updateRunStatus(groupId, year, month, 'APPROVED', 'approved_by', 'approved_at', user.id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Approval failed' };
  }
}

export async function markPayrollGroupPaid(
  groupId: PayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await resolveFmCompanyId();
    const user = await requireFmRole(supabase);
    const db = createSupabaseServiceClient();
    const { companyId } = await resolveFmCompanyId();

    const { data: run } = await db
      .from('payroll_runs')
      .select('status')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Payroll run not found.' };
    if (run.status !== 'APPROVED') {
      return { success: false, error: 'Only MD-approved batches can be marked as paid.' };
    }

    await updateRunStatus(groupId, year, month, 'PAID', 'paid_by', 'paid_at', user.id);

    const { data: paidRun } = await db
      .from('payroll_runs')
      .select('id')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .single();

    if (paidRun) {
      await db
        .from('payslips')
        .update({ status: 'PAID', updated_at: new Date().toISOString() })
        .eq('payroll_run_id', paidRun.id);
    }

    revalidatePayrollPaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Mark paid failed' };
  }
}
