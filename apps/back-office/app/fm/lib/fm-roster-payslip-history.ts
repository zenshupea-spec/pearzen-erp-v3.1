import type { PinnedPayrollGroupKind } from './guard-payroll-cohorts';
import {
  hasPinnedPayrollWorkflow,
  isCashPayrollGroup,
  isGuardPayrollCohort,
  usesCohortBankDownload,
} from './guard-payroll-cohorts';
import type { FmPayrollRosterRow } from './fm-payroll-roster-data';
import {
  addPayrollMonths,
  formatPayrollPeriodLabel,
  historicalPortfolioScale,
  isLivePayrollPeriod,
  monthsFromLivePeriod,
  type PayrollPeriod,
} from './payroll-period';
import type { PayrollWorkflowStatus } from '../../../lib/payroll-run-types';
import type { AdvanceWorkflowStatus } from '../../../lib/advance-run-types';
import { isAdvanceWorkflowGroup } from '../../../lib/advance-run-types';

export const ROSTER_PAYSLIP_HISTORY_DEPTH = 12;

export type RosterPaymentChannel = 'bank' | 'cash';

export type RosterPeriodWorkflowSnapshot = {
  period: PayrollPeriod;
  payrollStatus?: PayrollWorkflowStatus;
  payrollPaidAt?: string;
  advanceStatus?: AdvanceWorkflowStatus;
  advancePaidAt?: string;
};

export type FmRosterPayslipHistoryEntry = {
  period: PayrollPeriod;
  periodLabel: string;
  row: FmPayrollRosterRow;
  channel: RosterPaymentChannel;
  hasAdvance: boolean;
  advanceAmountLkr: number;
};

export function rosterPaymentChannel(
  payrollGroup: PinnedPayrollGroupKind | undefined,
): RosterPaymentChannel {
  return isCashPayrollGroup(payrollGroup) ? 'cash' : 'bank';
}

export function scaleRosterRowForPeriod(
  row: FmPayrollRosterRow,
  period: PayrollPeriod,
): FmPayrollRosterRow {
  const scale = historicalPortfolioScale(period);
  const yy = String(period.year).slice(-2);
  const mm = String(period.month).padStart(2, '0');
  const empSlug = row.empNumber.replace(/[^A-Z0-9]/gi, '');
  const scaleMoney = (value?: number) =>
    value == null ? undefined : Math.round(value * scale);
  const scaleShifts = (value?: number) =>
    value == null ? undefined : Math.round(value * scale * 100) / 100;

  return {
    ...row,
    salaryLkr: Math.round(row.salaryLkr * scale),
    earningsLkr: Math.round(row.earningsLkr * scale),
    deductionsLkr: Math.round(row.deductionsLkr * scale),
    advanceDeductionLkr: Math.round(row.advanceDeductionLkr * scale),
    netPayLkr: Math.round(row.netPayLkr * scale),
    payslipId: `PS-${empSlug}-${yy}${mm}`,
    totalShifts: scaleShifts(row.totalShifts),
    daysWorked: scaleShifts(row.daysWorked),
    basicShiftPaidLkr: scaleMoney(row.basicShiftPaidLkr),
    adjustedBasicTotalLkr: scaleMoney(row.adjustedBasicTotalLkr),
    siteAllowanceLkr: scaleMoney(row.siteAllowanceLkr),
    extraOtLkr: scaleMoney(row.extraOtLkr),
    epfEmployeeLkr: scaleMoney(row.epfEmployeeLkr),
    epfEmployerLkr: scaleMoney(row.epfEmployerLkr),
    etfEmployerLkr: scaleMoney(row.etfEmployerLkr),
    payeeTaxLkr: scaleMoney(row.payeeTaxLkr),
    stampDutyLkr: scaleMoney(row.stampDutyLkr),
    smVisitPayLkr: scaleMoney(row.smVisitPayLkr),
    smFixedBasicLkr: scaleMoney(row.smFixedBasicLkr),
    shiftTypeLines: row.shiftTypeLines?.map((line) => ({
      ...line,
      shifts: scaleShifts(line.shifts) ?? 0,
      amountLkr: scaleMoney(line.amountLkr) ?? 0,
    })),
    deductionLines: row.deductionLines?.map((line) => ({
      ...line,
      amountLkr: scaleMoney(line.amountLkr) ?? 0,
    })),
  };
}

function historyAdvanceAmount(row: FmPayrollRosterRow, period: PayrollPeriod): number {
  if (row.advanceDeductionLkr <= 0) return 0;
  const scaled = scaleRosterRowForPeriod(row, period);
  const offset = monthsFromLivePeriod(period);
  if (offset === 0) return scaled.advanceDeductionLkr;
  if (offset < 0) {
    const seed = row.id.charCodeAt(0) + period.month;
    return seed % 3 === 0 ? scaled.advanceDeductionLkr : 0;
  }
  return 0;
}

export function buildPayslipHistoryEntries(
  row: FmPayrollRosterRow,
  anchorPeriod: PayrollPeriod,
  depth = ROSTER_PAYSLIP_HISTORY_DEPTH,
): FmRosterPayslipHistoryEntry[] {
  const channel = rosterPaymentChannel(row.payrollGroup);
  const entries: FmRosterPayslipHistoryEntry[] = [];

  for (let i = 0; i < depth; i += 1) {
    const period = addPayrollMonths(anchorPeriod, -i);
    const scaledRow = scaleRosterRowForPeriod(row, period);
    const advanceAmountLkr = historyAdvanceAmount(row, period);
    entries.push({
      period,
      periodLabel: formatPayrollPeriodLabel(period),
      row: scaledRow,
      channel,
      hasAdvance: advanceAmountLkr > 0,
      advanceAmountLkr,
    });
  }

  return entries;
}

export function periodWorkflowKey(period: PayrollPeriod): string {
  return `${period.year}-${period.month}`;
}

export function inferHistoricalBankSalaryPaid(
  period: PayrollPeriod,
  payrollGroup: PinnedPayrollGroupKind | undefined,
): boolean {
  const offset = monthsFromLivePeriod(period);
  if (offset >= 0) return false;
  if (!hasPinnedPayrollWorkflow(payrollGroup)) return offset <= -1;
  return true;
}

export function inferHistoricalBankAdvancePaid(period: PayrollPeriod): boolean {
  return monthsFromLivePeriod(period) < 0;
}

export function inferHistoricalCashPaid(period: PayrollPeriod): boolean {
  return monthsFromLivePeriod(period) < 0;
}

export function usesBankExportForGroup(payrollGroup: PinnedPayrollGroupKind | undefined): boolean {
  return usesCohortBankDownload(payrollGroup) || hasPinnedPayrollWorkflow(payrollGroup);
}

export function showAdvancePaymentForRow(
  payrollGroup: PinnedPayrollGroupKind | undefined,
  advanceAmountLkr: number,
): boolean {
  if (advanceAmountLkr <= 0) return false;
  if (isCashPayrollGroup(payrollGroup)) return true;
  return isAdvanceWorkflowGroup(payrollGroup);
}

export function isGuardCohortGroup(
  payrollGroup: PinnedPayrollGroupKind | undefined,
): payrollGroup is 'guard_commercial' | 'guard_other_bank' | 'guard_no_bank' {
  return isGuardPayrollCohort(payrollGroup);
}

export function isAnchorLivePeriod(period: PayrollPeriod): boolean {
  return isLivePayrollPeriod(period);
}

export function rosterWorkflowMap(
  snapshots: RosterPeriodWorkflowSnapshot[],
): Map<string, RosterPeriodWorkflowSnapshot> {
  return new Map(snapshots.map((snapshot) => [periodWorkflowKey(snapshot.period), snapshot]));
}
