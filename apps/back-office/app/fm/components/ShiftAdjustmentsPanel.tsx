'use client';

import { useState } from 'react';
import { Minus, Plus, History, Scale } from 'lucide-react';
import {
  effectiveShiftsAtSite,
  formatShiftChange,
  getPenaltyShiftReduction,
  type ShiftAuditEntry,
  type ShiftAdjustmentEmployee,
} from '../lib/shift-adjustments';

const lkr = (n: number) =>
  'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ShiftAdjustmentsPanelProps = {
  employee: ShiftAdjustmentEmployee;
  siteName: string;
  onAdjust: (delta: number, note: string) => void;
  disabled?: boolean;
};

export default function ShiftAdjustmentsPanel({
  employee,
  siteName,
  onAdjust,
  disabled = false,
}: ShiftAdjustmentsPanelProps) {
  const [note, setNote] = useState('');
  const penalty = getPenaltyShiftReduction(employee);
  const effective = effectiveShiftsAtSite(employee);
  const afterPenalty =
    employee.recordedShiftsAtSite - penalty.shiftsReduced;

  const handleAdjust = (delta: number) => {
    if (disabled) return;
    const trimmed = note.trim();
    onAdjust(
      delta,
      trimmed ||
        (delta > 0
          ? `FM added ${delta} shift${delta !== 1 ? 's' : ''} at ${siteName}`
          : `FM removed ${Math.abs(delta)} shift${Math.abs(delta) !== 1 ? 's' : ''} at ${siteName}`),
    );
    setNote('');
  };

  return (
    <div className="border-b border-slate-100 px-6 py-5">
      <div className="mb-3 flex items-center gap-2">
        <Scale className="h-4 w-4 text-indigo-500" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Shift Ledger — {siteName}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Recorded (system)
          </p>
          <p className="mt-1 font-mono text-lg font-black text-slate-900">
            {employee.recordedShiftsAtSite}
          </p>
        </div>
        {penalty.shiftsReduced > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
              Penalty cut (auto)
            </p>
            <p className="mt-1 font-mono text-lg font-black text-amber-800">
              −{penalty.shiftsReduced}
            </p>
            <p className="mt-0.5 text-[10px] text-amber-700">
              {lkr(penalty.penaltyAmountLkr)} @ {lkr(penalty.perShiftLkr)}/shift
            </p>
          </div>
        )}
        {employee.fmShiftDelta !== 0 && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              FM adjustment
            </p>
            <p className="mt-1 font-mono text-lg font-black text-indigo-800">
              {employee.fmShiftDelta > 0 ? '+' : ''}
              {employee.fmShiftDelta}
            </p>
          </div>
        )}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
            Payable shifts
          </p>
          <p className="mt-1 font-mono text-lg font-black text-emerald-800">{effective}</p>
          {(penalty.shiftsReduced > 0 || employee.fmShiftDelta !== 0) && (
            <p className="mt-0.5 text-[10px] text-emerald-700">
              {formatShiftChange(employee.recordedShiftsAtSite, effective)}
            </p>
          )}
        </div>
      </div>

      {penalty.shiftsReduced > 0 && (
        <p className="mb-4 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
          Penalty this month ({lkr(penalty.penaltyAmountLkr)}) reduces shifts by{' '}
          <span className="font-black">{penalty.shiftsReduced}</span> at{' '}
          {lkr(penalty.perShiftLkr)}/shift — recorded as{' '}
          <span className="font-mono font-bold">
            {formatShiftChange(employee.recordedShiftsAtSite, afterPenalty)}
          </span>{' '}
          before any FM changes.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="fm-shift-note"
            className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400"
          >
            Reason (optional)
          </label>
          <input
            id="fm-shift-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={disabled}
            placeholder="e.g. Verified extra shift on 14 May"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </div>
        <button
          type="button"
          onClick={() => handleAdjust(-1)}
          disabled={disabled || effective <= 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
          Remove shift
        </button>
        <button
          type="button"
          onClick={() => handleAdjust(1)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add shift
        </button>
      </div>

      {employee.shiftAuditLog.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Change log
            </p>
          </div>
          <ul className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
            {[...employee.shiftAuditLog].reverse().map((entry: ShiftAuditEntry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                      entry.source === 'PENALTY'
                        ? 'bg-amber-100 text-amber-800'
                        : entry.source === 'FM'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {entry.source}
                  </span>
                  <span className="font-mono text-[10px] font-bold text-slate-500">
                    {formatShiftChange(entry.previousShifts, entry.newShifts)}
                  </span>
                  <time className="text-[10px] text-slate-400">
                    {new Date(entry.at).toLocaleString('en-LK', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <p className="mt-1 text-slate-600">{entry.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
