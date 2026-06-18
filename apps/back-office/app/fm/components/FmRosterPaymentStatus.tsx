'use client';

import { CheckCircle2, Download } from 'lucide-react';
import type { PayrollWorkflowStatus } from '../../../lib/payroll-run-types';
import type { AdvanceWorkflowStatus } from '../../../lib/advance-run-types';
import type { RosterPaymentChannel } from '../lib/fm-roster-payslip-history';
import {
  cashPaymentStatus,
  type CashPaidRecord,
} from '../lib/roster-cash-paid-store';
import { FmCashPaymentTrigger, type CashPaymentKind } from './FmCashPaymentModal';
import type { PayrollPeriod } from '../lib/payroll-period';

function WorkflowChip({
  label,
  className,
  Icon = CheckCircle2,
}: {
  label: string;
  className: string;
  Icon?: typeof CheckCircle2;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${className}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function bankAdvanceLabel(status: AdvanceWorkflowStatus | undefined, paid: boolean): string {
  if (paid) return 'Advance paid';
  if (status === 'SUBMITTED_FOR_REVIEW') return 'Advance · MD';
  if (status === 'APPROVED') return 'Advance · approved';
  return 'Advance · draft';
}

export function FmRosterSalaryPaymentStatus({
  channel,
  paid,
  employeeId,
  period,
  dueLkr = 0,
  cashRecord,
  workflowStatus,
  usesCohortExport,
  onOpenCashPayment,
}: {
  channel: RosterPaymentChannel;
  paid: boolean;
  employeeId: string;
  period: PayrollPeriod;
  dueLkr?: number;
  cashRecord?: CashPaidRecord;
  workflowStatus?: PayrollWorkflowStatus;
  usesCohortExport?: boolean;
  onOpenCashPayment?: () => void;
}) {
  if (channel === 'cash' && onOpenCashPayment) {
    void paid;
    void cashRecord;
    return (
      <FmCashPaymentTrigger
        employeeId={employeeId}
        period={period}
        dueLkr={dueLkr}
        kind="salary"
        onOpen={onOpenCashPayment}
      />
    );
  }

  if (paid) {
    return (
      <WorkflowChip
        label={usesCohortExport ? 'Bank file sent' : 'Salary paid'}
        className="border-emerald-200 bg-emerald-50 text-emerald-800"
        Icon={usesCohortExport ? Download : CheckCircle2}
      />
    );
  }

  if (workflowStatus === 'APPROVED') {
    return (
      <WorkflowChip
        label="Awaiting bank export"
        className="border-sky-200 bg-sky-50 text-sky-800"
      />
    );
  }

  if (workflowStatus === 'SUBMITTED_FOR_REVIEW') {
    return (
      <WorkflowChip
        label="Locked · with MD"
        className="border-indigo-200 bg-indigo-50 text-indigo-800"
      />
    );
  }

  return (
    <WorkflowChip
      label="Not paid"
      className="border-slate-200 bg-slate-50 text-slate-500"
    />
  );
}

export function FmRosterAdvancePaymentStatus({
  channel,
  paid,
  employeeId,
  period,
  dueLkr = 0,
  workflowStatus,
  onOpenCashPayment,
}: {
  channel: RosterPaymentChannel;
  paid: boolean;
  employeeId: string;
  period: PayrollPeriod;
  dueLkr?: number;
  cashRecord?: CashPaidRecord;
  workflowStatus?: AdvanceWorkflowStatus;
  onOpenCashPayment?: () => void;
}) {
  if (channel === 'cash' && onOpenCashPayment) {
    void paid;
    return (
      <FmCashPaymentTrigger
        employeeId={employeeId}
        period={period}
        dueLkr={dueLkr}
        kind="advance"
        onOpen={onOpenCashPayment}
      />
    );
  }

  if (paid) {
    return (
      <WorkflowChip
        label="Advance paid"
        className="border-emerald-200 bg-emerald-50 text-emerald-800"
      />
    );
  }

  return (
    <WorkflowChip
      label={bankAdvanceLabel(workflowStatus, paid)}
      className={
        workflowStatus === 'SUBMITTED_FOR_REVIEW'
          ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
          : workflowStatus === 'APPROVED'
            ? 'border-sky-200 bg-sky-50 text-sky-800'
            : 'border-amber-200 bg-amber-50 text-amber-900'
      }
    />
  );
}

export function bankSalaryPaidFromWorkflow(
  paidAt: string | undefined,
  historicalPaid: boolean,
  usesCohortExport: boolean,
  cohortExported: boolean,
): boolean {
  if (historicalPaid) return true;
  if (usesCohortExport) return cohortExported;
  return Boolean(paidAt);
}

export function bankAdvancePaidFromWorkflow(
  paidAt: string | undefined,
  historicalPaid: boolean,
): boolean {
  if (historicalPaid) return true;
  return Boolean(paidAt);
}

export function isSalaryCashSettled(
  record: CashPaidRecord,
  dueLkr: number,
  historicalPaid: boolean,
): boolean {
  if (historicalPaid) return true;
  return cashPaymentStatus(record, dueLkr) === 'paid';
}

export function isAdvanceCashSettled(
  record: CashPaidRecord,
  dueLkr: number,
  historicalPaid: boolean,
): boolean {
  if (historicalPaid) return true;
  return cashPaymentStatus(record, dueLkr) === 'paid';
}

export type { CashPaymentKind };
