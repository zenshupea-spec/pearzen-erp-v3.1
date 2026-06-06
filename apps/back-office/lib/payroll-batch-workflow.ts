export const PAYROLL_WORKFLOW_STORAGE_KEY = 'pearzen:payroll-batch-workflow:v1';

export type PayrollGroupId = 'security' | 'cafe';
export type PayrollWorkflowStatus = 'DRAFT' | 'SUBMITTED_FOR_REVIEW' | 'APPROVED';

export interface PayrollGroupWorkflow {
  groupId: PayrollGroupId;
  batchId: string;
  status: PayrollWorkflowStatus;
  submittedAt?: string;
  approvedAt?: string;
}

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

export function getPayrollWorkflowState(): PayrollGroupWorkflow[] {
  return readRaw();
}

export function getGroupWorkflow(groupId: PayrollGroupId): PayrollGroupWorkflow {
  return readRaw().find((g) => g.groupId === groupId) ?? DEFAULT_WORKFLOW.find((g) => g.groupId === groupId)!;
}

export function submitGroupForMdReview(groupId: PayrollGroupId) {
  const next = readRaw().map((g) =>
    g.groupId === groupId
      ? { ...g, status: 'SUBMITTED_FOR_REVIEW' as const, submittedAt: new Date().toISOString(), approvedAt: undefined }
      : g,
  );
  writeRaw(next);
}

export function revertGroupToDraft(groupId: PayrollGroupId) {
  const next = readRaw().map((g) =>
    g.groupId === groupId
      ? { ...g, status: 'DRAFT' as const, submittedAt: undefined, approvedAt: undefined }
      : g,
  );
  writeRaw(next);
}

export function approvePayrollGroup(groupId: PayrollGroupId) {
  const next = readRaw().map((g) =>
    g.groupId === groupId
      ? { ...g, status: 'APPROVED' as const, approvedAt: new Date().toISOString() }
      : g,
  );
  writeRaw(next);
}

export function batchIdToGroupId(batchId: string): PayrollGroupId | null {
  const entry = Object.entries(PAYROLL_GROUP_TO_BATCH_ID).find(([, id]) => id === batchId);
  return entry ? (entry[0] as PayrollGroupId) : null;
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
