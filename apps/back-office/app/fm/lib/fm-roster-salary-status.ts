import type { PayrollWorkflowStatus } from '../../../lib/payroll-run-types';
import type { FmPayrollRosterRow } from './fm-payroll-roster-data';
import {
  inferHistoricalBankSalaryPaid,
  rosterPaymentChannel,
  scaleRosterRowForPeriod,
} from './fm-roster-payslip-history';
import { usesCohortBankDownload } from './guard-payroll-cohorts';
import {
  cashPaymentStatus,
  readCohortExport,
  readEmployeeCashPaid,
} from './roster-cash-paid-store';
import type { PayrollPeriod } from './payroll-period';

export type RosterSalaryPaymentState =
  | 'stopped'
  | 'half_hold'
  | 'paid'
  | 'partial'
  | 'awaiting_export'
  | 'with_md'
  | 'unpaid';

export type RosterSalaryPaymentFilter = 'all' | RosterSalaryPaymentState;

export type RosterSalaryStatusContext = {
  period: PayrollPeriod;
  payrollStatus?: PayrollWorkflowStatus;
  payrollPaidAt?: string;
  stopListEmpNos?: ReadonlySet<string>;
  holdListEmpNos?: ReadonlySet<string>;
};

function bankSalaryPaidFromWorkflow(
  paidAt: string | undefined,
  historicalPaid: boolean,
  usesCohortExport: boolean,
  cohortExported: boolean,
): boolean {
  if (historicalPaid) return true;
  if (usesCohortExport) return cohortExported;
  return Boolean(paidAt);
}

export function resolveRosterSalaryPaymentState(
  row: FmPayrollRosterRow,
  context: RosterSalaryStatusContext,
): RosterSalaryPaymentState {
  if (context.stopListEmpNos?.has(row.empNumber)) return 'stopped';
  if (context.holdListEmpNos?.has(row.empNumber)) return 'half_hold';

  const scaledRow = scaleRosterRowForPeriod(row, context.period);
  const dueLkr = scaledRow.netPayLkr;
  const channel = rosterPaymentChannel(row.payrollGroup);
  const usesCohortExport = usesCohortBankDownload(row.payrollGroup);
  const historicalSalaryPaid = inferHistoricalBankSalaryPaid(context.period, row.payrollGroup);
  const cohortExported =
    row.payrollGroup != null &&
    readCohortExport(row.payrollGroup, context.period).amountPaidLkr > 0;
  const salaryCashRecord = readEmployeeCashPaid('salary', row.id, context.period, dueLkr);

  if (channel === 'cash') {
    if (historicalSalaryPaid || cashPaymentStatus(salaryCashRecord, dueLkr) === 'paid') {
      return 'paid';
    }
    if (cashPaymentStatus(salaryCashRecord, dueLkr) === 'partial') {
      return 'partial';
    }
    return 'unpaid';
  }

  const salaryPaid = bankSalaryPaidFromWorkflow(
    context.payrollPaidAt,
    historicalSalaryPaid,
    usesCohortExport,
    cohortExported,
  );
  if (salaryPaid) return 'paid';

  if (context.payrollStatus === 'APPROVED') return 'awaiting_export';
  if (context.payrollStatus === 'SUBMITTED_FOR_REVIEW') return 'with_md';
  return 'unpaid';
}

export function matchesSalaryPaymentFilter(
  state: RosterSalaryPaymentState,
  filter: RosterSalaryPaymentFilter,
): boolean {
  if (filter === 'all') return true;
  return state === filter;
}

export function payrollRunContextForRow(
  row: FmPayrollRosterRow,
  period: PayrollPeriod,
  payrollRuns: Map<string, RosterSalaryStatusContext>,
): RosterSalaryStatusContext {
  const groupId = row.payrollGroup === 'cafe' ? 'cafe' : 'security';
  return (
    payrollRuns.get(groupId) ?? {
      period,
    }
  );
}

export const SALARY_PAYMENT_FILTER_OPTIONS: {
  id: RosterSalaryPaymentFilter;
  label: string;
  short: string;
}[] = [
  { id: 'all', label: 'All payment states', short: 'All' },
  { id: 'paid', label: 'Salary paid', short: 'Paid' },
  { id: 'partial', label: 'Partially paid (cash)', short: 'Partial' },
  { id: 'unpaid', label: 'Not paid', short: 'Unpaid' },
  { id: 'awaiting_export', label: 'Awaiting bank export', short: 'Export' },
  { id: 'with_md', label: 'Locked · with MD', short: 'With MD' },
  { id: 'half_hold', label: 'Half salary hold', short: 'Hold' },
  { id: 'stopped', label: 'Stop list', short: 'Stop' },
];

export function salaryPaymentStateLabel(state: RosterSalaryPaymentState): string {
  const opt = SALARY_PAYMENT_FILTER_OPTIONS.find((entry) => entry.id === state);
  return opt?.label ?? state;
}
