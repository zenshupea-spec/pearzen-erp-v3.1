export type PayrollGroupId = 'security' | 'cafe';

export type PayrollRunDbStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PAID';

/** UI workflow status (matches existing payroll-batch-workflow consumers). */
export type PayrollWorkflowStatus = 'DRAFT' | 'SUBMITTED_FOR_REVIEW' | 'APPROVED';

export interface PayrollGroupWorkflow {
  groupId: PayrollGroupId;
  batchId: string;
  status: PayrollWorkflowStatus;
  submittedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  payslipCount?: number;
  grossTotal?: number;
  netTotal?: number;
}

export interface PayrollBatchStatusPayload {
  tableReady: boolean;
  periodYear: number;
  periodMonth: number;
  generated: boolean;
  runs: PayrollGroupWorkflow[];
}

export function buildBatchId(year: number, month: number, groupId: PayrollGroupId): string {
  const yy = String(year).slice(-2);
  const mm = String(month).padStart(2, '0');
  const suffix = groupId === 'security' ? 'SEC' : 'CAF';
  return `PR-${yy}${mm}-${suffix}`;
}

export function batchIdToGroupId(batchId: string): PayrollGroupId | null {
  if (batchId.endsWith('-SEC')) return 'security';
  if (batchId.endsWith('-CAF')) return 'cafe';
  return null;
}

export function dbStatusToWorkflow(status: PayrollRunDbStatus): PayrollWorkflowStatus {
  if (status === 'SUBMITTED') return 'SUBMITTED_FOR_REVIEW';
  if (status === 'APPROVED' || status === 'PAID') return 'APPROVED';
  return 'DRAFT';
}

export function workflowToDbStatus(status: PayrollWorkflowStatus): PayrollRunDbStatus {
  if (status === 'SUBMITTED_FOR_REVIEW') return 'SUBMITTED';
  return status;
}

export function employeePayrollGroup(group: unknown): PayrollGroupId {
  return String(group ?? '').toUpperCase() === 'CAFE' ? 'cafe' : 'security';
}

export const PAYROLL_GROUP_LABELS: Record<PayrollGroupId, string> = {
  security: 'Security Firm Personnel',
  cafe: 'Café Employees',
};

export function isRunLocked(status: PayrollRunDbStatus): boolean {
  return status !== 'DRAFT';
}

export function canRegenerateRun(status: PayrollRunDbStatus): boolean {
  return status === 'DRAFT';
}
