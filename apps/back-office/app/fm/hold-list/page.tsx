'use client';

import { AlertOctagon, Banknote } from 'lucide-react';
import FmSubnav from '../components/FmSubnav';
import FmRetentionListTable from '../components/FmRetentionListTable';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { reportMeta } from '../lib/fm-portfolio-report-builders';
import { FM_LIVE_PAYROLL_PERIOD, formatPayrollPeriodLabel } from '../lib/payroll-period';
import { FM_SALARY_MONTH_HALF_HOLD_LIST } from '../lib/retention-lists';

const SALARY_MONTH_THRESHOLD = 10;

export default function FmHoldListPage() {
  const periodLabel = formatPayrollPeriodLabel(FM_LIVE_PAYROLL_PERIOD);
  const periodShort = periodLabel.split(' ')[0];
  const meta = reportMeta('half-hold');
  const rows = [...FM_SALARY_MONTH_HALF_HOLD_LIST];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FmSubnav />

        <div className="mb-6">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{meta.title}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{meta.subtitle}</p>
        </div>

        <ExecutiveGlassCard className="mb-6 bg-gradient-to-br from-amber-50/60 to-white/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-amber-300/80 bg-amber-100/80">
                <Banknote className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
                  Retention Engine — Half Salary Active
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-amber-900">
                  {rows.length} Guards
                </p>
                <p className="mt-1 text-[11px] font-semibold text-amber-700">
                  Half salary only — {periodShort} shifts below threshold
                </p>
              </div>
            </div>
            <p className="text-right text-[10px] font-semibold text-slate-400">
              {periodLabel} · threshold {SALARY_MONTH_THRESHOLD} shifts
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-100/60 px-3 py-2">
            <AlertOctagon className="h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">
              Guards on this list receive half salary until salary-month attendance clears the threshold
            </span>
          </div>
        </ExecutiveGlassCard>

        <FmRetentionListTable rows={rows} variant="half" />
      </div>
    </div>
  );
}
