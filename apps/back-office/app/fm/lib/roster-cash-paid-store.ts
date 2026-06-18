import type { PayrollPeriod } from './payroll-period';
import { periodWorkflowKey } from './fm-roster-payslip-history';

export type CashPaidAuditAction = 'payment' | 'reverted';

export type CashPaidAuditEvent = {
  action: CashPaidAuditAction;
  at: string;
  by: string;
  amountLkr?: number;
  cumulativeLkr?: number;
  dueLkr?: number;
};

export type CashPaidRecord = {
  amountPaidLkr: number;
  dueLkr?: number;
  events: CashPaidAuditEvent[];
};

export type CashPaymentStatus = 'unpaid' | 'partial' | 'paid';

const SALARY_PREFIX = 'pearzen-fm-roster-cash-salary:';
const ADVANCE_PREFIX = 'pearzen-fm-roster-cash-advance:';
const COHORT_PREFIX = 'pearzen-fm-roster-cohort-export:';

export type CashPaidKind = 'salary' | 'advance' | 'cohort';

type LegacyCashPaidRecord = {
  paid?: boolean;
  events?: CashPaidAuditEvent[];
  amountPaidLkr?: number;
  dueLkr?: number;
};

function prefixForKind(kind: CashPaidKind): string {
  if (kind === 'salary') return SALARY_PREFIX;
  if (kind === 'advance') return ADVANCE_PREFIX;
  return COHORT_PREFIX;
}

function storageKey(kind: CashPaidKind, scopeId: string, period: PayrollPeriod): string {
  return `${prefixForKind(kind)}${scopeId}:${periodWorkflowKey(period)}`;
}

function cohortStorageKey(payrollGroup: string, period: PayrollPeriod): string {
  return `${COHORT_PREFIX}${payrollGroup}:${periodWorkflowKey(period)}`;
}

function normalizeRecord(raw: LegacyCashPaidRecord | null, dueLkr?: number): CashPaidRecord {
  if (!raw) return { amountPaidLkr: 0, dueLkr, events: [] };

  if (typeof raw.amountPaidLkr === 'number' && Array.isArray(raw.events)) {
    return {
      amountPaidLkr: Math.max(0, raw.amountPaidLkr),
      dueLkr: raw.dueLkr ?? dueLkr,
      events: raw.events,
    };
  }

  const legacyPaid = raw.paid === true;
  const events = Array.isArray(raw.events) ? raw.events : [];
  return {
    amountPaidLkr: legacyPaid ? (dueLkr ?? 0) : 0,
    dueLkr,
    events: events.map((event) =>
      (event as { action?: string }).action === 'marked_paid'
        ? {
            ...event,
            action: 'payment' as const,
            amountLkr: dueLkr,
            cumulativeLkr: dueLkr,
            dueLkr,
          }
        : event,
    ),
  };
}

function readRecord(key: string, dueLkr?: number): CashPaidRecord | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  if (raw === '1') {
    return { amountPaidLkr: dueLkr ?? 0, dueLkr, events: [] };
  }
  try {
    return normalizeRecord(JSON.parse(raw) as LegacyCashPaidRecord, dueLkr);
  } catch {
    return null;
  }
}

function writeRecord(key: string, record: CashPaidRecord): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(record));
  window.dispatchEvent(new CustomEvent('pearzen-fm-roster-cash-change'));
}

export function cashPaymentStatus(record: CashPaidRecord, dueLkr: number): CashPaymentStatus {
  if (record.amountPaidLkr <= 0 || dueLkr <= 0) return 'unpaid';
  if (record.amountPaidLkr >= dueLkr) return 'paid';
  return 'partial';
}

export function cashRemainingLkr(record: CashPaidRecord, dueLkr: number): number {
  return Math.max(0, dueLkr - record.amountPaidLkr);
}

export function readEmployeeCashPaid(
  kind: 'salary' | 'advance',
  employeeId: string,
  period: PayrollPeriod,
  dueLkr?: number,
): CashPaidRecord {
  return (
    readRecord(storageKey(kind, employeeId, period), dueLkr) ?? {
      amountPaidLkr: 0,
      dueLkr,
      events: [],
    }
  );
}

export function readCohortExport(
  payrollGroup: string,
  period: PayrollPeriod,
  dueLkr?: number,
): CashPaidRecord {
  return (
    readRecord(cohortStorageKey(payrollGroup, period), dueLkr) ?? {
      amountPaidLkr: 0,
      dueLkr,
      events: [],
    }
  );
}

export function recordEmployeeCashPayment(
  kind: 'salary' | 'advance',
  employeeId: string,
  period: PayrollPeriod,
  actorLabel: string,
  paymentLkr: number,
  dueLkr: number,
): CashPaidRecord {
  const key = storageKey(kind, employeeId, period);
  const current = readRecord(key, dueLkr) ?? { amountPaidLkr: 0, dueLkr, events: [] };
  const remaining = cashRemainingLkr(current, dueLkr);
  const applied = Math.min(Math.max(0, Math.round(paymentLkr)), remaining > 0 ? remaining : dueLkr);
  const nextAmount = Math.min(dueLkr, current.amountPaidLkr + applied);

  const next: CashPaidRecord = {
    amountPaidLkr: nextAmount,
    dueLkr,
    events: [
      ...current.events,
      {
        action: 'payment',
        at: new Date().toISOString(),
        by: actorLabel.trim() || 'FM User',
        amountLkr: applied,
        cumulativeLkr: nextAmount,
        dueLkr,
      },
    ],
  };
  writeRecord(key, next);
  return next;
}

export function revertEmployeeCashPaid(
  kind: 'salary' | 'advance',
  employeeId: string,
  period: PayrollPeriod,
  actorLabel: string,
  dueLkr?: number,
): CashPaidRecord {
  const key = storageKey(kind, employeeId, period);
  const current = readRecord(key, dueLkr) ?? { amountPaidLkr: 0, dueLkr, events: [] };
  const next: CashPaidRecord = {
    amountPaidLkr: 0,
    dueLkr: current.dueLkr ?? dueLkr,
    events: [
      ...current.events,
      {
        action: 'reverted',
        at: new Date().toISOString(),
        by: actorLabel.trim() || 'FM User',
        cumulativeLkr: 0,
        dueLkr: current.dueLkr ?? dueLkr,
      },
    ],
  };
  writeRecord(key, next);
  return next;
}

export function markEmployeeCashPaid(
  kind: 'salary' | 'advance',
  employeeId: string,
  period: PayrollPeriod,
  actorLabel: string,
  dueLkr = 0,
): CashPaidRecord {
  return recordEmployeeCashPayment(kind, employeeId, period, actorLabel, dueLkr, dueLkr);
}

export function markCohortExportedRecord(
  payrollGroup: string,
  period: PayrollPeriod,
  actorLabel: string,
): CashPaidRecord {
  const key = cohortStorageKey(payrollGroup, period);
  const current = readRecord(key) ?? { amountPaidLkr: 0, events: [] };
  const next: CashPaidRecord = {
    amountPaidLkr: 1,
    events: [
      ...current.events,
      {
        action: 'payment',
        at: new Date().toISOString(),
        by: actorLabel.trim() || 'FM User',
        amountLkr: 1,
        cumulativeLkr: 1,
      },
    ],
  };
  writeRecord(key, next);
  return next;
}

export function revertCohortExportedRecord(
  payrollGroup: string,
  period: PayrollPeriod,
  actorLabel: string,
): CashPaidRecord {
  const key = cohortStorageKey(payrollGroup, period);
  const current = readRecord(key) ?? { amountPaidLkr: 0, events: [] };
  const next: CashPaidRecord = {
    amountPaidLkr: 0,
    events: [
      ...current.events,
      {
        action: 'reverted',
        at: new Date().toISOString(),
        by: actorLabel.trim() || 'FM User',
        cumulativeLkr: 0,
      },
    ],
  };
  writeRecord(key, next);
  return next;
}

export function formatCashPaidAuditAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatCashLkr(amount: number): string {
  return `LKR ${amount.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function cashPaidAuditActionLabel(event: CashPaidAuditEvent): string {
  if (event.action === 'reverted') return 'Reverted to unpaid';
  if (event.amountLkr != null && event.dueLkr != null && event.cumulativeLkr != null) {
    if (event.cumulativeLkr >= event.dueLkr) {
      return `Paid in full · ${formatCashLkr(event.amountLkr)}`;
    }
    return `Partial payment · ${formatCashLkr(event.amountLkr)}`;
  }
  return 'Cash payment recorded';
}
