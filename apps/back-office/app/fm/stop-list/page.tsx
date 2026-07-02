'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertOctagon, History, Loader2 } from 'lucide-react';

import FmSubnav from '../components/FmSubnav';
import StaffPortalLoading from '../../../components/portal/StaffPortalLoading';
import FmRetentionListTable from '../components/FmRetentionListTable';
import FmPayrollMonthSelector from '../components/FmPayrollMonthSelector';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { reportMeta } from '../lib/fm-portfolio-report-builders';
import { getFmRetentionLists } from '../lib/fm-retention-actions';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  prevPayrollMonth,
  type PayrollPeriod,
} from '../lib/payroll-period';

export default function FmStopListPage() {
  const [payrollPeriod, setPayrollPeriod] = useState<PayrollPeriod>(FM_LIVE_PAYROLL_PERIOD);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getFmRetentionLists>>['stopList']>([]);
  const [threshold, setThreshold] = useState(30);
  const [prevMonthLabel, setPrevMonthLabel] = useState('');
  const [guardOpsEnabled, setGuardOpsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (period: PayrollPeriod) => {
    setLoading(true);
    const payload = await getFmRetentionLists(period);
    setRows(payload.stopList);
    setThreshold(payload.thresholds.prevMonthMinShifts);
    setPrevMonthLabel(payload.prevMonthLabel);
    setGuardOpsEnabled(payload.guardOpsEnabled);
    setError(payload.error ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh(payrollPeriod);
  }, [payrollPeriod, refresh]);

  const prevMonthShort = formatPayrollPeriodLabel(prevPayrollMonth(payrollPeriod), 'short').split(
    ' ',
  )[0];
  const meta = reportMeta('stop-list');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FmSubnav />

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{meta.title}</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Live guards with previous-month shifts below the MD retention threshold
            </p>
          </div>
          <FmPayrollMonthSelector period={payrollPeriod} onChange={setPayrollPeriod} />
        </div>

        {error && (
          <ExecutiveGlassCard className="mb-6 border-rose-200/80 bg-rose-50/60 p-5">
            <p className="text-sm font-bold text-rose-900">Could not load stop list</p>
            <p className="mt-1 text-sm text-rose-800">{error}</p>
          </ExecutiveGlassCard>
        )}

        {!guardOpsEnabled && !loading && (
          <ExecutiveGlassCard className="mb-6 p-5">
            <p className="text-sm font-bold text-slate-800">Guard operations paused</p>
            <p className="mt-1 text-sm text-slate-600">
              Guard retention lists require live field attendance. Enable guard ops or use Payroll
              Ledger for HO, SM, and café cohorts.
            </p>
          </ExecutiveGlassCard>
        )}

        {guardOpsEnabled && (
          <>
            <ExecutiveGlassCard className="mb-6 bg-gradient-to-br from-rose-50/60 to-white/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-rose-300/80 bg-rose-100/80">
                    <History className="h-5 w-5 text-rose-700" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600">
                      Retention Engine — Hard Stop Active
                    </p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-rose-900">
                      {loading ? '…' : rows.length} Guards
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-rose-700">
                      Payment halted — {prevMonthShort} shifts below threshold
                    </p>
                  </div>
                </div>
                <p className="text-right text-[10px] font-semibold text-slate-400">
                  {prevMonthLabel} · threshold {threshold} shifts
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200/80 bg-rose-100/60 px-3 py-2">
                <AlertOctagon className="h-3.5 w-3.5 flex-shrink-0 text-rose-700" />
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-800">
                  Guards on this list receive no payroll until previous-month attendance clears the
                  threshold
                </span>
              </div>
            </ExecutiveGlassCard>

            {loading ? (
              <StaffPortalLoading portal="fm" message="Loading live stop list…" className="min-h-[16rem]" />
            ) : rows.length === 0 ? (
              <ExecutiveGlassCard className="p-6">
                <p className="text-sm font-bold text-slate-800">No guards on stop list</p>
                <p className="mt-2 text-sm text-slate-600">
                  Every active guard met the previous-month shift threshold ({threshold}) for{' '}
                  {prevMonthLabel}.
                </p>
              </ExecutiveGlassCard>
            ) : (
              <FmRetentionListTable rows={rows} variant="stop" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
