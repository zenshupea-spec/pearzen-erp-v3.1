'use client';

import { useMemo } from 'react';
import { HeartHandshake, X } from 'lucide-react';
import {
  buildWelfareFundMonthlyHistory,
  type WelfareFundSettings,
} from '../../../../../packages/welfare-fund';
import { FM_LIVE_PAYROLL_PERIOD, formatPayrollPeriodLabel } from '../lib/payroll-period';

function lkr(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

type FmWelfareFundModalProps = {
  settings: WelfareFundSettings;
  liveHeadcount: number;
  highlightPeriod?: { year: number; month: number };
  onClose: () => void;
};

export default function FmWelfareFundModal({
  settings,
  liveHeadcount,
  highlightPeriod,
  onClose,
}: FmWelfareFundModalProps) {
  const rows = useMemo(
    () =>
      buildWelfareFundMonthlyHistory({
        settings,
        livePeriod: FM_LIVE_PAYROLL_PERIOD,
        liveHeadcount,
        monthsBack: 24,
      }),
    [settings, liveHeadcount],
  );

  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + r.totalContributionLkr, 0),
    [rows],
  );

  const highlightLabel = highlightPeriod
    ? formatPayrollPeriodLabel(highlightPeriod)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-600">
              <HeartHandshake className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Employee Welfare Fund</p>
              <p className="text-[11px] text-slate-500">
                {lkr(settings.monthlyDeductionLkr)} per employee · monthly fund totals
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-4 text-xs font-medium text-slate-600">
            Total contributions collected each month (deduction per employee × active payroll
            headcount). Configure the per-employee amount in MD Settings → Employee Welfare Fund.
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3 text-right">Headcount</th>
                  <th className="px-4 py-3 text-right">Per employee</th>
                  <th className="px-4 py-3 text-right">Fund total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const isHighlight =
                    highlightPeriod &&
                    row.year === highlightPeriod.year &&
                    row.month === highlightPeriod.month;
                  return (
                    <tr
                      key={`${row.year}-${row.month}`}
                      className={isHighlight ? 'bg-teal-50/80' : 'hover:bg-slate-50/80'}
                    >
                      <td className="px-4 py-3 font-bold text-slate-800">
                        {row.periodLabel}
                        {isHighlight && (
                          <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-teal-700">
                            Selected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {row.headcount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {lkr(row.deductionPerEmployeeLkr)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-black tabular-nums text-teal-800">
                        {lkr(row.totalContributionLkr)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-teal-50/50">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-xs font-black uppercase tracking-widest text-teal-900">
                    Sum of {rows.length} months shown
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black tabular-nums text-teal-900">
                    {lkr(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {highlightLabel && (
            <p className="mt-3 text-[11px] font-bold text-teal-800">
              Batch desk period: {highlightLabel} — row highlighted above.
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 justify-end border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
