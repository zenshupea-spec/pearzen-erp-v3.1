'use client';

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  formatPayrollPeriodLabel,
  isLivePayrollPeriod,
  nextPayrollMonth,
  prevPayrollMonth,
  type PayrollPeriod,
} from '../lib/payroll-period';

export default function FmPayrollMonthSelector({
  period,
  onChange,
  minYear = 2025,
  maxYear = 2027,
}: {
  period: PayrollPeriod;
  onChange: (period: PayrollPeriod) => void;
  minYear?: number;
  maxYear?: number;
}) {
  const atMin = period.year === minYear && period.month === 1;
  const atMax = period.year === maxYear && period.month === 12;
  const isLive = isLivePayrollPeriod(period);

  return (
    <div
      className={`flex items-center gap-1 rounded-lg border px-1 py-1 shadow-sm ${
        isLive ? 'border-slate-200 bg-white' : 'border-red-200/80 bg-red-50/80'
      }`}
    >
      <span className="hidden items-center gap-1.5 pl-2 pr-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 sm:inline-flex">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
        Period
      </span>
      <button
        type="button"
        onClick={() => onChange(prevPayrollMonth(period))}
        disabled={atMin}
        aria-label="Previous month"
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <label className="sr-only" htmlFor="fm-payroll-month-select">
        Payroll month
      </label>
      <select
        id="fm-payroll-month-select"
        value={`${period.year}-${period.month}`}
        onChange={(e) => {
          const [y, m] = e.target.value.split('-').map(Number);
          onChange({ year: y, month: m });
        }}
        className="min-w-[7.5rem] cursor-pointer appearance-none rounded-md border-0 bg-transparent py-1.5 pl-1 pr-6 text-center text-xs font-black text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
      >
        {Array.from({ length: maxYear - minYear + 1 }, (_, yi) => minYear + yi).flatMap((year) =>
          Array.from({ length: 12 }, (_, mi) => {
            const month = mi + 1;
            const p = { year, month };
            return (
              <option key={`${year}-${month}`} value={`${year}-${month}`}>
                {formatPayrollPeriodLabel(p)}
              </option>
            );
          }),
        )}
      </select>
      <button
        type="button"
        onClick={() => onChange(nextPayrollMonth(period))}
        disabled={atMax}
        aria-label="Next month"
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
