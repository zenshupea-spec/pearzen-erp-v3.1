import type { PinnedPayrollGroupKind } from '../app/fm/lib/guard-payroll-cohorts';

export type CashPayrollGroupId =
  | 'guard_no_bank'
  | 'ho_no_bank'
  | 'sm_no_bank'
  | 'cafe_no_bank';

export type AdvancePayrollGroupId = Exclude<PinnedPayrollGroupKind, CashPayrollGroupId>;

export type AdvanceRunDbStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID';

export type AdvanceWorkflowStatus = 'DRAFT' | 'SUBMITTED_FOR_REVIEW' | 'APPROVED';

export interface AdvanceGroupWorkflow {
  groupId: AdvancePayrollGroupId;
  batchId: string;
  status: AdvanceWorkflowStatus;
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  selectionCount?: number;
  totalAmount?: number;
}

export interface AdvanceBatchStatusPayload {
  tableReady: boolean;
  periodYear: number;
  periodMonth: number;
  runs: AdvanceGroupWorkflow[];
}

const GROUP_SUFFIX: Record<AdvancePayrollGroupId, string> = {
  ho: 'HO',
  sm: 'SM',
  cafe: 'CAF',
  guard_commercial: 'GCB',
  guard_other_bank: 'GOB',
};

export const ADVANCE_GROUP_LABELS: Record<AdvancePayrollGroupId, string> = {
  ho: 'CVS Payroll Group',
  sm: 'SM CVS Payroll Group',
  cafe: 'Café Payroll Group',
  guard_commercial: 'Guards — Commercial Bank',
  guard_other_bank: 'Guards — Other Banks',
};

export function isAdvanceWorkflowGroup(
  payrollGroup: string | undefined,
): payrollGroup is AdvancePayrollGroupId {
  return (
    payrollGroup === 'ho' ||
    payrollGroup === 'sm' ||
    payrollGroup === 'cafe' ||
    payrollGroup === 'guard_commercial' ||
    payrollGroup === 'guard_other_bank'
  );
}

export function buildAdvanceBatchId(
  year: number,
  month: number,
  groupId: AdvancePayrollGroupId,
): string {
  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');
  return `ADV-${yy}${mm}-${GROUP_SUFFIX[groupId]}`;
}

export function advanceBatchIdToGroupId(batchId: string): AdvancePayrollGroupId | null {
  const suffix = batchId.split('-').pop()?.toUpperCase();
  if (!suffix) return null;
  const entry = Object.entries(GROUP_SUFFIX).find(([, value]) => value === suffix);
  return (entry?.[0] as AdvancePayrollGroupId | undefined) ?? null;
}

export function dbStatusToAdvanceWorkflow(status: AdvanceRunDbStatus): AdvanceWorkflowStatus {
  if (status === 'SUBMITTED') return 'SUBMITTED_FOR_REVIEW';
  if (status === 'APPROVED' || status === 'PAID') return 'APPROVED';
  return 'DRAFT';
}

export function isAdvanceRunLocked(status: AdvanceRunDbStatus): boolean {
  return status !== 'DRAFT';
}
