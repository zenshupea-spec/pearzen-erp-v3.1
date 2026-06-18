/**
 * Payroll batch helpers — bank file export and legacy localStorage fallback.
 * Workflow state is persisted in `payroll_runs` via payroll-run-actions.ts.
 */

export type {
  PayrollGroupId,
  PayrollGroupWorkflow,
  PayrollWorkflowStatus,
} from './payroll-run-types';

export {
  buildBatchId,
  batchIdToGroupId,
  PAYROLL_GROUP_LABELS,
} from './payroll-run-types';

import type { PayrollGroupId, PayrollGroupWorkflow } from './payroll-run-types';

export const PAYROLL_WORKFLOW_STORAGE_KEY = 'pearzen:payroll-batch-workflow:v1';

/** @deprecated Use buildBatchId(year, month, groupId) — kept for mock/demo pages. */
export const PAYROLL_GROUP_TO_BATCH_ID: Record<PayrollGroupId, string> = {
  security: 'PR-2605-SEC',
  cafe: 'PR-2605-CAF',
};

const DEFAULT_WORKFLOW: PayrollGroupWorkflow[] = [
  { groupId: 'security', batchId: PAYROLL_GROUP_TO_BATCH_ID.security, status: 'DRAFT' },
  { groupId: 'cafe', batchId: PAYROLL_GROUP_TO_BATCH_ID.cafe, status: 'DRAFT' },
];

function readRaw(): PayrollGroupWorkflow[] {
  if (typeof window === 'undefined') return DEFAULT_WORKFLOW;
  try {
    const raw = localStorage.getItem(PAYROLL_WORKFLOW_STORAGE_KEY);
    if (!raw) return DEFAULT_WORKFLOW;
    const parsed = JSON.parse(raw) as PayrollGroupWorkflow[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WORKFLOW;
    return DEFAULT_WORKFLOW.map((def) => parsed.find((p) => p.groupId === def.groupId) ?? def);
  } catch {
    return DEFAULT_WORKFLOW;
  }
}

function writeRaw(entries: PayrollGroupWorkflow[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PAYROLL_WORKFLOW_STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent('payroll-workflow-changed'));
}

/** Legacy localStorage read — prefer getPayrollBatchStatus server action. */
export function getPayrollWorkflowState(): PayrollGroupWorkflow[] {
  return readRaw();
}

export function getGroupWorkflow(groupId: PayrollGroupId): PayrollGroupWorkflow {
  return readRaw().find((g) => g.groupId === groupId) ?? DEFAULT_WORKFLOW.find((g) => g.groupId === groupId)!;
}

/** Legacy fallback when payroll_runs table is unavailable. */
export function submitGroupForMdReview(groupId: PayrollGroupId) {
  const next = readRaw().map((g) =>
    g.groupId === groupId
      ? { ...g, status: 'SUBMITTED_FOR_REVIEW' as const, submittedAt: new Date().toISOString(), approvedAt: undefined }
      : g,
  );
  writeRaw(next);
}

/** Legacy fallback when payroll_runs table is unavailable. */
export function revertGroupToDraft(groupId: PayrollGroupId) {
  const next = readRaw().map((g) =>
    g.groupId === groupId
      ? { ...g, status: 'DRAFT' as const, submittedAt: undefined, approvedAt: undefined }
      : g,
  );
  writeRaw(next);
}

/** Legacy fallback when payroll_runs table is unavailable. */
export function approvePayrollGroup(groupId: PayrollGroupId) {
  const next = readRaw().map((g) =>
    g.groupId === groupId
      ? { ...g, status: 'APPROVED' as const, approvedAt: new Date().toISOString() }
      : g,
  );
  writeRaw(next);
}

export function subscribePayrollWorkflow(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener('payroll-workflow-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('payroll-workflow-changed', handler);
    window.removeEventListener('storage', handler);
  };
}

export function generateBankTransferTxt(groupLabel: string, gross: number, headcount: number): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return [
    'HDR|Commercial Bank v3.2|PEARZEN ERP',
    `BATCH|${groupLabel.replace(/\s+/g, '_').toUpperCase()}|${date}`,
    `SUMMARY|RECIPIENTS=${headcount}|GROSS=${gross}`,
    'EOF',
  ].join('\n');
}

export function generateOtherBankTransferTxt(
  groupLabel: string,
  gross: number,
  headcount: number,
): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return [
    'HDR|Other Banks Export|PEARZEN ERP',
    `BATCH|${groupLabel.replace(/\s+/g, '_').toUpperCase()}|${date}`,
    `SUMMARY|RECIPIENTS=${headcount}|GROSS=${gross}|DESTINATION=NON_COMMERCIAL`,
    'EOF',
  ].join('\n');
}

/** Cash desk list — no Commercial Bank account or other-bank net pay settled in cash. */
export function generateCashPayoutTxt(groupLabel: string, gross: number, headcount: number): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return [
    'HDR|Cash Payout Schedule|PEARZEN ERP',
    `BATCH|${groupLabel.replace(/\s+/g, '_').toUpperCase()}_CASH|${date}`,
    `SUMMARY|RECIPIENTS=${headcount}|GROSS=${gross}|REASON=NO_ACCT_OR_NON_COMMERCIAL`,
    'EOF',
  ].join('\n');
}

export function triggerBankTxtDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
