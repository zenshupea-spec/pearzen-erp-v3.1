'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  getDeductionMonthLockStatus,
  lockDeductionMonthForFm,
  type DeductionMonthLockStatus,
} from './actions';
import { payrollMonthFirstDay, payrollMonthLabel } from './lib/payroll-month';

export default function DeductionsMonthLockBar() {
  const [monthInput, setMonthInput] = useState(() => payrollMonthFirstDay().slice(0, 7));
  const [status, setStatus] = useState<DeductionMonthLockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const payrollMonth = payrollMonthFirstDay(monthInput);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getDeductionMonthLockStatus(monthInput);
    setStatus(next);
    setLoading(false);
  }, [monthInput]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLock = () => {
    setMessage(null);
    const drafts = status?.draftEntryCount ?? 0;
    const label = payrollMonthLabel(payrollMonth);
    if (
      drafts > 0 &&
      !window.confirm(
        `${drafts} monthly entr${drafts === 1 ? 'y is' : 'ies are'} still in draft for ${label}. Lock and send to FM anyway?`,
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `Lock ${label} deductions and notify FM? She cannot lock payroll for this month until you do.`,
      )
    ) {
      return;
    }

    startTransition(() => {
      void lockDeductionMonthForFm(payrollMonth).then((res) => {
        if (!res.success) {
          setMessage(res.error ?? 'Lock failed');
          return;
        }
        setMessage(`Sent ${label} deductions to FM — payroll lock is now enabled on her desk.`);
        void refresh();
      });
    });
  };

  const locked = status?.locked ?? false;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Month</span>
          <input
            type="month"
            value={monthInput}
            onChange={(e) => setMonthInput(e.target.value)}
            disabled={locked || isPending}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-800 disabled:bg-slate-50"
          />
        </label>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold uppercase text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </span>
        ) : locked ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Sent to FM · {payrollMonthLabel(payrollMonth)}
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleLock}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-600 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 shrink-0" />
            )}
            Lock month &amp; send to FM
          </button>
        )}
      </div>
      {!locked && !loading ? (
        <p className="max-w-xs text-right text-[10px] font-semibold text-slate-500">
          FM cannot lock payroll until you send this month&apos;s deductions.
          {(status?.draftEntryCount ?? 0) > 0 ? (
            <span className="text-amber-700">
              {' '}
              {status?.draftEntryCount} draft entr
              {status?.draftEntryCount === 1 ? 'y' : 'ies'} remaining.
            </span>
          ) : null}
        </p>
      ) : null}
      {message ? (
        <p className="max-w-sm text-right text-[10px] font-semibold text-indigo-800">{message}</p>
      ) : null}
      {status?.isDemo && !status.tableReady && !locked ? (
        <p className="max-w-xs text-right text-[10px] font-semibold text-amber-800">
          Preview mode — lock is stored locally until migration{' '}
          <code className="text-[9px]">20260604290000_payroll_deduction_month_lock.sql</code> runs.
        </p>
      ) : null}
    </div>
  );
}
