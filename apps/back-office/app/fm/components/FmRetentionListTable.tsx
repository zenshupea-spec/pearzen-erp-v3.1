import { AlertTriangle } from 'lucide-react';
import { lkr } from '../lib/fm-portfolio-report-builders';
import type { RetentionGuardRow } from '../lib/retention-lists';

export type FmRetentionListVariant = 'stop' | 'half';

export default function FmRetentionListTable({
  rows,
  variant,
}: {
  rows: RetentionGuardRow[];
  variant: FmRetentionListVariant;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {[
              'Employee',
              'Shifts Here',
              'Total Gross (All Sites)',
              'Total Deductions',
              'Net Take-Home',
              'Actions',
            ].map((col) => (
              <th
                key={col}
                className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((g) => (
            <tr key={g.empNo} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-xs">
                <span className="font-bold text-slate-900">{g.name}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{g.empNo}</span>
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-800">
                {String(g.shiftsHere)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-800">
                {g.totalGross > 0 ? lkr(g.totalGross) : '—'}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-800">
                {g.totalDeductions > 0 ? `− ${lkr(g.totalDeductions)}` : '—'}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-800">
                {g.netTakeHome > 0 ? lkr(g.netTakeHome) : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    variant === 'stop'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {variant === 'stop' ? 'Payment halted' : 'Half salary'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
