'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { auditStaffAction } from '../../lib/staff-audit';
import {
  fetchBackOfficeUserProfile,
  type BackOfficeUserProfile,
} from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import { canAccessPathViaPortalRbac } from '../../../../packages/portal-rbac';
import {
  validateAdvanceRowsForPeriod,
  validateSalaryAdvanceRecord,
} from './lib/fm-advance-validation';
import {
  buildAdvanceBatchId,
  dbStatusToAdvanceWorkflow,
  type AdvanceBatchStatusPayload,
  type AdvanceGroupWorkflow,
  type AdvancePayrollGroupId,
  type AdvanceRunDbStatus,
  ADVANCE_GROUP_LABELS,
} from '../../lib/advance-run-types';
import { writeAdvanceRunWorkflowAudit } from '../../lib/payroll-run-audit';

const ADVANCE_PATHS = ['/fm/advance', '/executive/advance', '/executive/audit'] as const;

function revalidateAdvancePaths() {
  for (const path of ADVANCE_PATHS) revalidatePath(path);
}

function isMissingAdvanceTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || /advance_runs/i.test(error.message ?? '');
}

async function resolveFmCompanyId() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return { supabase, companyId: rosterCompanyId(sessionCompanyId) };
}

function canPerformFmAdvanceWrite(profile: BackOfficeUserProfile): boolean {
  const role = normalizePortalRole(profile.role);
  if (role === 'FM' || role === 'MD' || role === 'OD') return true;
  if (profile.rbacGated) {
    return canAccessPathViaPortalRbac('/fm/advance', profile.portalRbac ?? undefined, {
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
  if (!canPerformFmAdvanceWrite(profile)) throw new Error('Forbidden');
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

function rowToWorkflow(row: Record<string, unknown>): AdvanceGroupWorkflow {
  const groupId = row.group_id as AdvancePayrollGroupId;
  const dbStatus = row.status as AdvanceRunDbStatus;
  return {
    groupId,
    batchId: String(row.batch_id),
    status: dbStatusToAdvanceWorkflow(dbStatus),
    submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    paidAt: row.paid_at ? String(row.paid_at) : undefined,
    selectionCount: Number(row.selection_count ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
  };
}

export async function getAdvanceBatchStatus(
  year: number,
  month: number,
): Promise<AdvanceBatchStatusPayload> {
  const { companyId } = await resolveFmCompanyId();
  if (!companyId) {
    return { tableReady: false, periodYear: year, periodMonth: month, runs: [] };
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('advance_runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month);

  if (error) {
    if (isMissingAdvanceTable(error)) {
      return { tableReady: false, periodYear: year, periodMonth: month, runs: [] };
    }
    console.error('getAdvanceBatchStatus:', error.message);
    return { tableReady: true, periodYear: year, periodMonth: month, runs: [] };
  }

  return {
    tableReady: true,
    periodYear: year,
    periodMonth: month,
    runs: (data ?? []).map((row) => rowToWorkflow(row as Record<string, unknown>)),
  };
}

export type MdAdvanceBatchLine = {
  profileId: string;
  empNumber: string;
  name: string;
  rank: string;
  amount: number;
};

export type MdAdvanceBatch = {
  batchId: string;
  groupId: AdvancePayrollGroupId;
  groupLabel: string;
  periodYear: number;
  periodMonth: number;
  status: AdvanceRunDbStatus;
  submittedAt?: string;
  approvedAt?: string;
  selectionCount: number;
  totalAmount: number;
  lines: MdAdvanceBatchLine[];
};

export async function getMdAdvanceBatches(
  year: number,
  month: number,
): Promise<{ batches: MdAdvanceBatch[]; tableReady: boolean }> {
  const supabase = await createSupabaseServerClient();
  await requireMdRole(supabase);
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  const companyId = rosterCompanyId(sessionCompanyId);
  if (!companyId) return { batches: [], tableReady: false };

  const db = createSupabaseServiceClient();
  const { data: runs, error } = await db
    .from('advance_runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .neq('status', 'DRAFT')
    .order('submitted_at', { ascending: false });

  if (error) {
    if (isMissingAdvanceTable(error)) return { batches: [], tableReady: false };
    console.error('getMdAdvanceBatches:', error.message);
    return { batches: [], tableReady: true };
  }

  const batches: MdAdvanceBatch[] = [];
  for (const run of runs ?? []) {
    const groupId = String(run.group_id) as AdvancePayrollGroupId;
    const { data: advances } = await db
      .from('salary_advances')
      .select('profile_id, emp_number, amount')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('payroll_group', groupId)
      .in('status', ['SUBMITTED', 'APPROVED']);

    const profileIds = (advances ?? []).map((row) => String(row.profile_id));
    const namesByProfile = new Map<string, { name: string; rank: string }>();

    if (profileIds.length > 0) {
      const { data: employees } = await db
        .from('employees')
        .select('id, full_name, rank')
        .in('id', profileIds);
      for (const emp of employees ?? []) {
        namesByProfile.set(String(emp.id), {
          name: String(emp.full_name ?? 'Unknown'),
          rank: String(emp.rank ?? '—'),
        });
      }
    }

    const lines: MdAdvanceBatchLine[] = (advances ?? []).map((row) => {
      const profileId = String(row.profile_id);
      const meta = namesByProfile.get(profileId);
      return {
        profileId,
        empNumber: String(row.emp_number ?? ''),
        name: meta?.name ?? 'Unknown',
        rank: meta?.rank ?? '—',
        amount: Number(row.amount ?? 0),
      };
    });

    batches.push({
      batchId: String(run.batch_id),
      groupId,
      groupLabel: ADVANCE_GROUP_LABELS[groupId] ?? groupId,
      periodYear: year,
      periodMonth: month,
      status: run.status as AdvanceRunDbStatus,
      submittedAt: run.submitted_at ? String(run.submitted_at) : undefined,
      approvedAt: run.approved_at ? String(run.approved_at) : undefined,
      selectionCount: Number(run.selection_count ?? lines.length),
      totalAmount: Number(run.total_amount ?? 0),
      lines,
    });
  }

  return { batches, tableReady: true };
}

async function updateAdvanceRunStatus(
  groupId: AdvancePayrollGroupId,
  year: number,
  month: number,
  nextStatus: AdvanceRunDbStatus,
  actorField: 'submitted_by' | 'approved_by' | 'paid_by',
  timestampField: 'submitted_at' | 'approved_at' | 'paid_at',
  actorId: string,
) {
  const db = createSupabaseServiceClient();
  const { companyId } = await resolveFmCompanyId();
  const nowIso = new Date().toISOString();

  await db
    .from('advance_runs')
    .update({
      status: nextStatus,
      [actorField]: actorId,
      [timestampField]: nowIso,
      updated_at: nowIso,
    })
    .eq('company_id', companyId!)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('group_id', groupId);

  const advanceStatus =
    nextStatus === 'SUBMITTED'
      ? 'SUBMITTED'
      : nextStatus === 'APPROVED' || nextStatus === 'PAID'
        ? 'APPROVED'
        : 'DRAFT';

  await db
    .from('salary_advances')
    .update({ status: advanceStatus, updated_at: nowIso })
    .eq('company_id', companyId!)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('payroll_group', groupId);

  revalidateAdvancePaths();
}

export async function upsertAdvanceRunTotals(
  groupId: AdvancePayrollGroupId,
  year: number,
  month: number,
  selectionCount: number,
  totalAmount: number,
): Promise<void> {
  const { companyId } = await resolveFmCompanyId();
  if (!companyId) return;

  const db = createSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const batchId = buildAdvanceBatchId(year, month, groupId);

  const { data: existing, error: existingError } = await db
    .from('advance_runs')
    .select('status')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('group_id', groupId)
    .maybeSingle();

  if (existingError && isMissingAdvanceTable(existingError)) return;
  if (existing && existing.status !== 'DRAFT') return;

  const { error } = await db.from('advance_runs').upsert(
    {
      company_id: companyId,
      period_year: year,
      period_month: month,
      group_id: groupId,
      batch_id: batchId,
      status: 'DRAFT',
      selection_count: selectionCount,
      total_amount: Number(totalAmount.toFixed(2)),
      updated_at: nowIso,
    },
    { onConflict: 'company_id,period_year,period_month,group_id' },
  );
  if (error && !isMissingAdvanceTable(error)) {
    console.error('upsertAdvanceRunTotals:', error.message);
  }
}

export async function submitAdvanceGroupForReview(
  groupId: AdvancePayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await resolveFmCompanyId();
    const user = await requireFmRole(supabase);
    const db = createSupabaseServiceClient();
    const { companyId } = await resolveFmCompanyId();

    const { data: run } = await db
      .from('advance_runs')
      .select('id, status, selection_count')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) {
      return { success: false, error: 'Save advance selections before submitting for MD review.' };
    }
    if (run.status !== 'DRAFT') {
      return { success: false, error: 'This batch is already submitted or approved.' };
    }
    if ((run.selection_count ?? 0) === 0) {
      return { success: false, error: 'No employees selected. Choose at least one advance recipient.' };
    }

    const { data: advances } = await db
      .from('salary_advances')
      .select('profile_id, amount, payroll_group')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('payroll_group', groupId)
      .in('status', ['DRAFT', 'SUBMITTED']);

    const validation = await validateAdvanceRowsForPeriod(
      companyId!,
      year,
      month,
      (advances ?? []).map((row) => ({
        profileId: String(row.profile_id),
        amount: Number(row.amount ?? 0),
        payrollGroup: row.payroll_group != null ? String(row.payroll_group) : groupId,
      })),
    );
    if (!validation.ok) {
      return { success: false, error: validation.error };
    }

    await updateAdvanceRunStatus(
      groupId,
      year,
      month,
      'SUBMITTED',
      'submitted_by',
      'submitted_at',
      user.id,
    );

    await auditStaffAction({
      supabase,
      portal: 'fm',
      action: 'Submit Advance Salary Batch',
      targetEntity: buildAdvanceBatchId(year, month, groupId),
      details: { groupId, periodYear: year, periodMonth: month },
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Submit failed' };
  }
}

export async function revertAdvanceGroupToDraft(
  groupId: AdvancePayrollGroupId,
  year: number,
  month: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await resolveFmCompanyId();
    await requireFmRole(supabase);
    const db = createSupabaseServiceClient();
    const { companyId } = await resolveFmCompanyId();

    const { data: run } = await db
      .from('advance_runs')
      .select('status')
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Advance batch not found.' };
    if (run.status === 'PAID') {
      return { success: false, error: 'Cannot re-edit a batch after the bank file was downloaded.' };
    }

    const nowIso = new Date().toISOString();
    await db
      .from('advance_runs')
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
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId);

    await db
      .from('salary_advances')
      .update({ status: 'DRAFT', updated_at: nowIso })
      .eq('company_id', companyId!)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('payroll_group', groupId);

    revalidateAdvancePaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Revert failed' };
  }
}

export async function approveAdvanceGroupRun(
  groupId: AdvancePayrollGroupId,
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
      .from('advance_runs')
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

    const { data: advances } = await db
      .from('salary_advances')
      .select('profile_id, amount, payroll_group')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('payroll_group', groupId)
      .in('status', ['SUBMITTED']);

    const validation = await validateAdvanceRowsForPeriod(
      companyId,
      year,
      month,
      (advances ?? []).map((row) => ({
        profileId: String(row.profile_id),
        amount: Number(row.amount ?? 0),
        payrollGroup: row.payroll_group != null ? String(row.payroll_group) : groupId,
      })),
    );
    if (!validation.ok) {
      return { success: false, error: validation.error };
    }

    await updateAdvanceRunStatus(
      groupId,
      year,
      month,
      'APPROVED',
      'approved_by',
      'approved_at',
      user.id,
    );

    const audit = await writeAdvanceRunWorkflowAudit(supabase, companyId, groupId, year, month);
    if (!audit.ok) return { success: false, error: audit.error };

    revalidateAdvancePaths();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Approval failed' };
  }
}

export async function markAdvanceGroupPaid(
  groupId: AdvancePayrollGroupId,
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
      .from('advance_runs')
      .select('status')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month)
      .eq('group_id', groupId)
      .maybeSingle();

    if (!run) return { success: false, error: 'Advance batch not found.' };
    if (run.status !== 'APPROVED') {
      return { success: false, error: 'Only MD-approved batches can be marked as paid.' };
    }

    await updateAdvanceRunStatus(groupId, year, month, 'PAID', 'paid_by', 'paid_at', user.id);
    revalidatePath('/fm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Mark paid failed' };
  }
}
