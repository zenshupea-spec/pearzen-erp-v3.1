import type { SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { buildAdvanceBatchId, type AdvancePayrollGroupId } from './advance-run-types';
import { buildBatchId, type PayrollGroupId } from './payroll-run-types';

export type PayrollBatchAuditAction =
  | 'SUBMIT_PAYROLL_BATCH'
  | 'APPROVE_PAYROLL_BATCH'
  | 'REVERT_PAYROLL_BATCH'
  | 'MARK_PAYROLL_BATCH_PAID'
  | 'APPROVE_ADVANCE_BATCH';

export type PayrollBatchAuditDetails = {
  groupId: string;
  periodYear: number;
  periodMonth: number;
  netTotal?: number;
  payslipCount?: number;
  payrollRunId?: string;
  selectionCount?: number;
  totalAmount?: number;
};

export type PayrollBatchAuditResult = { ok: true } | { ok: false; error: string };

export async function writePayrollBatchAuditLog(
  supabase: SupabaseClient,
  companyId: string,
  actionType: PayrollBatchAuditAction,
  batchId: string,
  details: PayrollBatchAuditDetails,
): Promise<PayrollBatchAuditResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorEmail = user?.email ?? 'SYSTEM_ADMIN';

  // Service role — session client INSERT fails RLS when slug tenant != JWT company scope.
  const auditDb = createSupabaseServiceClient();
  const { error } = await auditDb.from('executive_audit_logs').insert({
    company_id: companyId,
    actor_email: actorEmail,
    action_type: actionType,
    entity: batchId,
    details,
  });

  if (error) {
    console.error('writePayrollBatchAuditLog:', error.message);
    return {
      ok: false,
      error: 'Payroll action completed but the audit ledger could not be updated.',
    };
  }

  return { ok: true };
}

export async function fetchPayrollRunAuditSnapshot(
  companyId: string,
  groupId: PayrollGroupId,
  year: number,
  month: number,
) {
  const db = createSupabaseServiceClient();
  const { data: run } = await db
    .from('payroll_runs')
    .select('id, batch_id, net_total, payslip_count')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('group_id', groupId)
    .maybeSingle();

  if (!run) return null;

  return {
    payrollRunId: String(run.id),
    batchId: String(run.batch_id ?? buildBatchId(year, month, groupId)),
    netTotal: Number(run.net_total ?? 0),
    payslipCount: Number(run.payslip_count ?? 0),
  };
}

export async function fetchAdvanceRunAuditSnapshot(
  companyId: string,
  groupId: AdvancePayrollGroupId,
  year: number,
  month: number,
) {
  const db = createSupabaseServiceClient();
  const { data: run } = await db
    .from('advance_runs')
    .select('id, batch_id, selection_count, total_amount')
    .eq('company_id', companyId)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('group_id', groupId)
    .maybeSingle();

  if (!run) return null;

  return {
    payrollRunId: String(run.id),
    batchId: String(run.batch_id ?? buildAdvanceBatchId(year, month, groupId)),
    selectionCount: Number(run.selection_count ?? 0),
    totalAmount: Number(run.total_amount ?? 0),
  };
}

export async function writePayrollRunWorkflowAudit(
  supabase: SupabaseClient,
  companyId: string,
  groupId: PayrollGroupId,
  year: number,
  month: number,
  actionType: Exclude<PayrollBatchAuditAction, 'APPROVE_ADVANCE_BATCH'>,
): Promise<PayrollBatchAuditResult> {
  const snapshot = await fetchPayrollRunAuditSnapshot(companyId, groupId, year, month);
  return writePayrollBatchAuditLog(
    supabase,
    companyId,
    actionType,
    snapshot?.batchId ?? buildBatchId(year, month, groupId),
    {
      groupId,
      periodYear: year,
      periodMonth: month,
      netTotal: snapshot?.netTotal,
      payslipCount: snapshot?.payslipCount,
      payrollRunId: snapshot?.payrollRunId,
    },
  );
}

export async function writeAdvanceRunWorkflowAudit(
  supabase: SupabaseClient,
  companyId: string,
  groupId: AdvancePayrollGroupId,
  year: number,
  month: number,
): Promise<PayrollBatchAuditResult> {
  const snapshot = await fetchAdvanceRunAuditSnapshot(companyId, groupId, year, month);
  return writePayrollBatchAuditLog(
    supabase,
    companyId,
    'APPROVE_ADVANCE_BATCH',
    snapshot?.batchId ?? buildAdvanceBatchId(year, month, groupId),
    {
      groupId,
      periodYear: year,
      periodMonth: month,
      selectionCount: snapshot?.selectionCount,
      totalAmount: snapshot?.totalAmount,
      payrollRunId: snapshot?.payrollRunId,
    },
  );
}

export async function resolveAuthUserDisplayName(
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return 'Unknown';

  const service = createSupabaseServiceClient();
  try {
    const { data, error } = await service.auth.admin.getUserById(userId);
    if (error || !data.user) return 'Unknown';

    const meta = data.user.user_metadata ?? {};
    const fromMeta =
      (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
      (typeof meta.name === 'string' && meta.name.trim());
    if (fromMeta) return fromMeta;

    const email = data.user.email;
    if (email) {
      const local = email.split('@')[0]?.trim();
      return local || email;
    }

    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}

export async function resolveAuthUserDisplayNames(
  userIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, string>();
  await Promise.all(
    unique.map(async (id) => {
      map.set(id, await resolveAuthUserDisplayName(id));
    }),
  );
  return map;
}
