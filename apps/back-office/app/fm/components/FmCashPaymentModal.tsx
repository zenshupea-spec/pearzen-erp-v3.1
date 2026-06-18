'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, RotateCcw, X } from 'lucide-react';
import {
  cashPaidAuditActionLabel,
  cashPaymentStatus,
  cashRemainingLkr,
  formatCashLkr,
  formatCashPaidAuditAt,
  type CashPaidAuditEvent,
} from '../lib/roster-cash-paid-store';
import { useRosterCashPaid } from '../lib/use-roster-cash-paid';
import type { PayrollPeriod } from '../lib/payroll-period';

export type CashPaymentKind = 'salary' | 'advance';

function lkr(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FmCashPaymentModal({
  open,
  onClose,
  employeeId,
  employeeName,
  employeeNumber,
  period,
  dueLkr,
  kind = 'salary',
  title = 'Salary · cash payment',
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  period: PayrollPeriod;
  dueLkr: number;
  kind?: CashPaymentKind;
  title?: string;
}) {
  const cash = useRosterCashPaid(employeeId);
  const record =
    kind === 'salary'
      ? cash.salaryRecord(period, dueLkr)
      : cash.advanceRecord(period, dueLkr);
  const auditEvents =
    kind === 'salary'
      ? cash.salaryCashAudit(period, dueLkr)
      : cash.advanceCashAudit(period, dueLkr);

  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const remaining = cashRemainingLkr(record, dueLkr);
  const [amountInput, setAmountInput] = useState(String(remaining));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setAmountInput(String(remaining));
  }, [open, remaining]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const parsedAmount = Math.max(0, Math.round(Number.parseInt(amountInput, 10) || 0));
  const canSubmitPartial = parsedAmount > 0 && parsedAmount < remaining;
  const status = cashPaymentStatus(record, dueLkr);

  const recordPayment = (amount: number) => {
    if (kind === 'salary') {
      cash.recordSalaryCashPayment(period, amount, dueLkr);
    } else {
      cash.recordAdvanceCashPayment(period, amount, dueLkr);
    }
  };

  const revertPayment = () => {
    if (kind === 'salary') {
      cash.revertSalaryCashPaid(period, dueLkr);
    } else {
      cash.revertAdvanceCashPaid(period, dueLkr);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-50">
              <Banknote className="h-4 w-4 text-amber-700" />
            </div>
            <div>
              <p id={titleId} className="text-sm font-black text-slate-900">
                {title}
              </p>
              <p className="text-[11px] text-slate-500">
                {employeeName} · {employeeNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Net due</p>
              <p className="mt-1 font-mono text-xs font-black text-slate-900">{lkr(dueLkr)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Paid</p>
              <p className="mt-1 font-mono text-xs font-black text-emerald-800">
                {lkr(record.amountPaidLkr)}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700">Remaining</p>
              <p className="mt-1 font-mono text-xs font-black text-amber-900">{lkr(remaining)}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Payment audit log
            </p>
            {auditEvents.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-[11px] font-medium text-slate-500">
                No cash payments recorded yet for this period.
              </p>
            ) : (
              <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                {[...auditEvents].reverse().map((event, index) => (
                  <AuditLogItem key={`${event.at}-${index}`} event={event} />
                ))}
              </ul>
            )}
          </div>

          {remaining > 0 && (
            <>
              <label className="mt-4 block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Amount to pay (LKR)
                </span>
                <input
                  ref={inputRef}
                  type="number"
                  min={1}
                  max={remaining}
                  step={100}
                  value={amountInput}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === '' || /^\d+$/.test(raw)) setAmountInput(raw);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-base font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-200"
                />
              </label>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={remaining <= 0}
                  onClick={() => {
                    recordPayment(remaining);
                    onClose();
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-600 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  Pay full · {formatCashLkr(remaining)}
                </button>
                <button
                  type="button"
                  disabled={!canSubmitPartial}
                  onClick={() => {
                    recordPayment(parsedAmount);
                    onClose();
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                >
                  Record partial
                </button>
              </div>
            </>
          )}

          {record.amountPaidLkr > 0 && (
            <button
              type="button"
              onClick={() => {
                revertPayment();
                onClose();
              }}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-rose-800 hover:bg-rose-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Revert to unpaid
            </button>
          )}

          {status === 'paid' && remaining <= 0 && (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-semibold text-emerald-800">
              Fully paid in cash for this period.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AuditLogItem({ event }: { event: CashPaidAuditEvent }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
      <p className="text-[11px] font-bold text-slate-800">{cashPaidAuditActionLabel(event)}</p>
      {event.cumulativeLkr != null && event.action === 'payment' && (
        <p className="mt-0.5 text-[10px] font-medium text-emerald-700">
          Running total · {formatCashLkr(event.cumulativeLkr)}
        </p>
      )}
      <p className="mt-0.5 text-[10px] text-slate-500">{formatCashPaidAuditAt(event.at)}</p>
      <p className="text-[10px] font-semibold text-slate-600">By {event.by}</p>
    </li>
  );
}

export function FmCashPaymentTrigger({
  employeeId,
  period,
  dueLkr,
  kind = 'salary',
  onOpen,
  compact = true,
}: {
  employeeId: string;
  period: PayrollPeriod;
  dueLkr: number;
  kind?: CashPaymentKind;
  onOpen: () => void;
  compact?: boolean;
}) {
  const cash = useRosterCashPaid(employeeId);
  const record =
    kind === 'salary'
      ? cash.salaryRecord(period, dueLkr)
      : cash.advanceRecord(period, dueLkr);
  const auditEvents =
    kind === 'salary'
      ? cash.salaryCashAudit(period, dueLkr)
      : cash.advanceCashAudit(period, dueLkr);
  const status = cashPaymentStatus(record, dueLkr);
  const lastEvent = auditEvents[auditEvents.length - 1];
  const hoverHint = lastEvent
    ? `${cashPaidAuditActionLabel(lastEvent)} · ${formatCashPaidAuditAt(lastEvent.at)} · ${lastEvent.by}`
    : 'Click to record cash payment';

  if (status === 'paid') {
    return (
      <button
        type="button"
        title={hoverHint}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-800 hover:bg-emerald-100"
      >
        <Banknote className="h-2.5 w-2.5" />
        Paid in cash
      </button>
    );
  }

  if (status === 'partial') {
    return (
      <button
        type="button"
        title={hoverHint}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-900 hover:bg-amber-100"
      >
        <Banknote className="h-2.5 w-2.5" />
        Partial · {formatCashLkr(record.amountPaidLkr)}
      </button>
    );
  }

  return (
    <button
      type="button"
      title={hoverHint}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      disabled={dueLkr <= 0}
      className={`inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 text-[10px] font-black uppercase tracking-wider text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 ${
        compact ? 'px-2 py-1.5' : 'px-2.5 py-1.5'
      }`}
    >
      <Banknote className="h-3 w-3" />
      {compact ? 'Cash pay' : 'Mark cash payment'}
    </button>
  );
}
