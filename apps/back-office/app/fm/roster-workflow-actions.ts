'use server';

import { getAdvanceBatchStatus } from './advance-run-actions';
import { getPayrollBatchStatus } from './payroll-run-actions';
import type { RosterPeriodWorkflowSnapshot } from './lib/fm-roster-payslip-history';
import { addPayrollMonths, type PayrollPeriod } from './lib/payroll-period';
import type { AdvancePayrollGroupId } from '../../lib/advance-run-types';
import type { PayrollGroupId } from '../../lib/payroll-run-types';
import type { PinnedPayrollGroupKind } from './lib/guard-payroll-cohorts';

function payrollRunGroupId(payrollGroup: PinnedPayrollGroupKind | undefined): PayrollGroupId {
  return payrollGroup === 'cafe' ? 'cafe' : 'security';
}

function advanceRunGroupId(
  payrollGroup: PinnedPayrollGroupKind | undefined,
): AdvancePayrollGroupId | null {
  if (payrollGroup === 'ho') return 'ho';
  if (payrollGroup === 'sm') return 'sm';
  if (payrollGroup === 'cafe') return 'cafe';
  if (payrollGroup === 'guard_commercial') return 'guard_commercial';
  if (payrollGroup === 'guard_other_bank') return 'guard_other_bank';
  return null;
}

export async function getRosterWorkflowSnapshots(
  anchorPeriod: PayrollPeriod,
  payrollGroup: PinnedPayrollGroupKind | undefined,
  depth: number,
): Promise<RosterPeriodWorkflowSnapshot[]> {
  const payrollGroupId = payrollRunGroupId(payrollGroup);
  const advanceGroupId = advanceRunGroupId(payrollGroup);

  const periods: PayrollPeriod[] = [];
  for (let i = 0; i < depth; i += 1) {
    periods.push(addPayrollMonths(anchorPeriod, -i));
  }

  const snapshots = await Promise.all(
    periods.map(async (period) => {
      const [payrollPayload, advancePayload] = await Promise.all([
        getPayrollBatchStatus(period.year, period.month),
        advanceGroupId
          ? getAdvanceBatchStatus(period.year, period.month)
          : Promise.resolve({ tableReady: false, periodYear: period.year, periodMonth: period.month, runs: [] }),
      ]);

      const payrollRun = payrollPayload.runs.find((run) => run.groupId === payrollGroupId);
      const advanceRun = advanceGroupId
        ? advancePayload.runs.find((run) => run.groupId === advanceGroupId)
        : undefined;

      return {
        period,
        payrollStatus: payrollRun?.status,
        payrollPaidAt: payrollRun?.paidAt,
        advanceStatus: advanceRun?.status,
        advancePaidAt: advanceRun?.paidAt,
      } satisfies RosterPeriodWorkflowSnapshot;
    }),
  );

  return snapshots;
}

