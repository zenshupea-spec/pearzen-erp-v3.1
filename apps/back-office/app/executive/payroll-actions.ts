'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import { fetchBackOfficeUserProfile } from '../../lib/hr-portal-access-server';
import { normalizePortalRole } from '../../lib/portal-role-utils';
import {
  batchIdToGroupId,
  dbStatusToWorkflow,
  type PayrollGroupId,
} from '../../lib/payroll-run-types';
import { formatPayrollPeriodLabel } from '../fm/lib/payroll-period';
import { resolveAuthUserDisplayNames } from '../../lib/payroll-run-audit';
import { getRankPayMatrix } from './settings/rank-matrix-actions';
import { adjustedMonthlyBasicFromRank } from '../../../../packages/rank-pay-matrix';
import { completedYearsOfService } from '../../../../packages/gratuity';

export type MdPayrollDeductionLine = { label: string; amount: number };

export type MdPayslipLine = {
  guardId: string;
  empNo: string;
  guardName: string;
  rank: string;
  totalShifts: number;
  basicPay: number;
  overtimePay: number;
  deductions: MdPayrollDeductionLine[];
  threeMonthAvgNet: number;
};

export type MdPayrollBatch = {
  id: string;
  period: string;
  company: string;
  submittedBy: string;
  submittedAt: string;
  status: 'SUBMITTED_FOR_REVIEW' | 'APPROVED';
  lines: MdPayslipLine[];
};

const GROUP_LABELS: Record<PayrollGroupId, string> = {
  security: 'Classic Venture Security',
  cafe: 'Café Tasha',
};

function isMissingPayrollTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01' || /payroll_runs|payslips/i.test(error.message ?? '');
}

async function requireMdRole() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const role = normalizePortalRole(profile.role);
  if (role !== 'MD' && role !== 'OD') throw new Error('Forbidden');
}

export async function getMdPayrollAuditBatches(
  year: number,
  month: number,
): Promise<{ batches: MdPayrollBatch[]; tableReady: boolean; error?: string }> {
  noStore();
  try {
    await requireMdRole();
    const supabase = await createSupabaseServerClient();
    const sessionCompanyId = await resolveCompanyIdForSession(supabase);
    const companyId = rosterCompanyId(sessionCompanyId);
    if (!companyId) return { batches: [], tableReady: false, error: 'No company context' };

    const db = createSupabaseServiceClient();
    const { data: runs, error: runsError } = await db
      .from('payroll_runs')
      .select('*')
      .eq('company_id', companyId)
      .eq('period_year', year)
      .eq('period_month', month);

    if (isMissingPayrollTable(runsError)) {
      return { batches: [], tableReady: false, error: 'Payroll tables not applied yet.' };
    }
    if (runsError) return { batches: [], tableReady: false, error: runsError.message };

    const submittedRuns = (runs ?? []).filter((r) => {
      const wf = dbStatusToWorkflow(r.status as 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID');
      return wf !== 'DRAFT';
    });

    if (!submittedRuns.length) {
      return { batches: [], tableReady: true };
    }

    const runIds = submittedRuns.map((r) => r.id);
    const { data: payslips, error: slipError } = await db
      .from('payslips')
      .select('id, profile_id, payroll_run_id, adjusted_basic, gross_pay, net_pay, period_year, period_month')
      .in('payroll_run_id', runIds);

    if (slipError) return { batches: [], tableReady: false, error: slipError.message };

    const profileIds = [...new Set((payslips ?? []).map((p) => p.profile_id))];
    const { data: employees } = profileIds.length
      ? await db
          .from('employees')
          .select('id, emp_number, full_name, rank, basic_salary, base_salary, date_joined')
          .in('id', profileIds)
      : { data: [] };

    const empById = new Map((employees ?? []).map((e) => [e.id, e]));
    const rankMatrix = await getRankPayMatrix();
    const periodEndIso = `${year}-${String(month).padStart(2, '0')}-28`;
    const periodLabel = formatPayrollPeriodLabel({ year, month });
    const submitterNames = await resolveAuthUserDisplayNames(
      submittedRuns.map((r) => (r.submitted_by != null ? String(r.submitted_by) : null)),
    );

    const batches: MdPayrollBatch[] = [];

    for (const run of submittedRuns) {
      const groupId = run.group_id as PayrollGroupId;
      const wf = dbStatusToWorkflow(run.status as 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID');
      const runSlips = (payslips ?? []).filter((p) => p.payroll_run_id === run.id);

      const lines: MdPayslipLine[] = runSlips.map((slip) => {
        const emp = empById.get(slip.profile_id);
        const rank = emp?.rank != null ? String(emp.rank) : 'Guard';
        const years = completedYearsOfService(
          emp?.date_joined != null ? String(emp.date_joined) : null,
          periodEndIso,
        );
        const recordedBasic =
          emp?.basic_salary != null
            ? Number(emp.basic_salary)
            : emp?.base_salary != null
              ? Number(emp.base_salary)
              : null;
        const matrixBasic = adjustedMonthlyBasicFromRank(rankMatrix, rank, years, recordedBasic);
        const gross = Number(slip.gross_pay ?? 0);
        const net = Number(slip.net_pay ?? 0);
        const basicPay = Number(slip.adjusted_basic ?? matrixBasic);
        const overtimePay = Math.max(0, gross - basicPay);
        const deductTotal = Math.max(0, gross - net);

        return {
          guardId: slip.profile_id,
          empNo: emp?.emp_number != null ? String(emp.emp_number) : slip.profile_id.slice(0, 8),
          guardName: emp?.full_name != null ? String(emp.full_name) : 'Unknown',
          rank,
          totalShifts: 20,
          basicPay,
          overtimePay,
          deductions: deductTotal > 0 ? [{ label: 'Payroll deductions', amount: deductTotal }] : [],
          threeMonthAvgNet: net,
        };
      });

      batches.push({
        id: String(run.batch_id),
        period: periodLabel,
        company: GROUP_LABELS[groupId] ?? groupId,
        submittedBy:
          run.submitted_by != null
            ? (submitterNames.get(String(run.submitted_by)) ?? 'Unknown')
            : 'Unknown',
        submittedAt: run.submitted_at ? String(run.submitted_at) : new Date().toISOString(),
        status: wf === 'APPROVED' ? 'APPROVED' : 'SUBMITTED_FOR_REVIEW',
        lines,
      });
    }

    return { batches, tableReady: true };
  } catch (err) {
    return {
      batches: [],
      tableReady: false,
      error: err instanceof Error ? err.message : 'Failed to load payroll batches',
    };
  }
}
