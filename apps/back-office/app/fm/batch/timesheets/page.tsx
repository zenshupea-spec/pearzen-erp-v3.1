'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Loader2, MapPin, TrendingUp, Users } from 'lucide-react';

import FmSubnav from '../../components/FmSubnav';
import StaffPortalLoading from '../../../../components/portal/StaffPortalLoading';
import FmPayrollMonthSelector from '../../components/FmPayrollMonthSelector';
import { ExecutiveGlassCard } from '../../../../components/executive/ExecutiveVaultShell';
import { FM_LIVE_PAYROLL_PERIOD, type PayrollPeriod } from '../../lib/payroll-period';
import {
  getFmBatchTimesheetRollups,
  type FmBatchTimesheetPayload,
  type SiteTimesheetRollup,
  type SmTimesheetRollup,
} from './actions';

export default function FmBatchTimesheetsPage() {
  const [payrollPeriod, setPayrollPeriod] = useState<PayrollPeriod>(FM_LIVE_PAYROLL_PERIOD);
  const [payload, setPayload] = useState<FmBatchTimesheetPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (period: PayrollPeriod) => {
    setLoading(true);
    const data = await getFmBatchTimesheetRollups(period);
    setPayload(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh(payrollPeriod);
  }, [payrollPeriod, refresh]);

  const smRollups = payload?.smRollups ?? [];
  const siteRollups = payload?.siteRollups ?? [];
  const periodLabel = payload?.periodLabel ?? '';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FmSubnav />

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Timesheet Reconciliation Totals
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Live sector manager and client-site roll-ups for batch payroll
            </p>
          </div>
          <FmPayrollMonthSelector period={payrollPeriod} onChange={setPayrollPeriod} />
        </div>

        {payload?.error && (
          <ExecutiveGlassCard className="mb-6 border-rose-200/80 bg-rose-50/60 p-5">
            <p className="text-sm font-bold text-rose-900">Could not load timesheet roll-ups</p>
            <p className="mt-1 text-sm text-rose-800">{payload.error}</p>
          </ExecutiveGlassCard>
        )}

        {!payload?.guardOpsEnabled && !loading && (
          <ExecutiveGlassCard className="mb-6 p-5">
            <p className="text-sm font-bold text-slate-800">Guard operations paused</p>
            <p className="mt-1 text-sm text-slate-600">
              Client guard timesheet roll-ups are hidden while CVS guard ops are disabled. Head
              office, SM, and café payroll continue on the Payroll Ledger.
            </p>
          </ExecutiveGlassCard>
        )}

        {loading ? (
          <StaffPortalLoading portal="fm" message="Loading live attendance roll-ups…" className="min-h-[16rem]" />
        ) : payload?.guardOpsEnabled ? (
          <div className="space-y-8">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-600" />
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                Attendance roll-ups — {periodLabel}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <RollupTable
                title="SM-Wise (Sector Totals)"
                icon={<Users className="h-4 w-4 text-emerald-600" />}
                badge={`${smRollups.length} sectors`}
                badgeClass="border-emerald-200/80 bg-emerald-50/80 text-emerald-800"
                emptyMessage="No confirmed guard shifts linked to sector managers for this month."
              >
                {smRollups.length > 0 && (
                  <>
                    <thead className="border-b border-slate-200/60">
                      <tr>
                        <th className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Sector Manager
                        </th>
                        <th className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Guards
                        </th>
                        <th className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Total Shifts
                        </th>
                        <th className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Avg
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/50">
                      {smRollups.map((s: SmTimesheetRollup) => (
                        <tr key={s.smKey} className="transition-colors hover:bg-white/40">
                          <td className="px-5 py-2.5">
                            <p className="max-w-[200px] truncate text-[12px] font-bold leading-tight text-slate-800">
                              {s.sm}
                            </p>
                            <p className="text-[10px] font-semibold text-slate-500">{s.sector}</p>
                          </td>
                          <td className="px-4 py-2.5 text-center text-[12px] font-bold tabular-nums text-slate-700">
                            {s.guards}
                          </td>
                          <td className="px-4 py-2.5 text-center text-[13px] font-black tabular-nums text-emerald-800">
                            {s.totalShifts.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-center text-[12px] font-semibold tabular-nums text-slate-600">
                            {s.avgShifts.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-slate-200/70 bg-slate-50/40">
                      <tr>
                        <td className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Company Total
                        </td>
                        <td className="px-4 py-2.5 text-center text-[12px] font-black tabular-nums text-slate-700">
                          {smRollups.reduce((sum, row) => sum + row.guards, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[13px] font-black tabular-nums text-emerald-900">
                          {smRollups.reduce((sum, row) => sum + row.totalShifts, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[12px] font-semibold tabular-nums text-slate-600">
                          {smRollups.length > 0
                            ? (
                                smRollups.reduce((sum, row) => sum + row.avgShifts, 0) /
                                smRollups.length
                              ).toFixed(1)
                            : '0.0'}
                        </td>
                      </tr>
                    </tfoot>
                  </>
                )}
              </RollupTable>

              <RollupTable
                title="Site-Wise (Location Totals)"
                icon={<MapPin className="h-4 w-4 text-violet-600" />}
                badge={`${siteRollups.length} sites`}
                badgeClass="border-violet-200/80 bg-violet-50/80 text-violet-800"
                emptyMessage="No client sites with confirmed shifts for this month."
              >
                {siteRollups.length > 0 && (
                  <>
                    <thead className="border-b border-slate-200/60">
                      <tr>
                        <th className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Site
                        </th>
                        <th className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Guards
                        </th>
                        <th className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Shifts Provided
                        </th>
                        <th className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Shifts Client Requested
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/50">
                      {siteRollups.map((s: SiteTimesheetRollup) => {
                        const hasVariance = s.shiftsProvided !== s.shiftsClientRequested;
                        return (
                          <tr
                            key={s.siteId}
                            className={`transition-colors ${
                              hasVariance
                                ? 'bg-amber-50/30 hover:bg-amber-50/60'
                                : 'hover:bg-white/40'
                            }`}
                          >
                            <td className="px-5 py-2.5">
                              <p className="max-w-[200px] truncate text-[12px] font-bold leading-tight text-slate-800">
                                {s.site}
                              </p>
                              <p className="text-[10px] font-semibold text-slate-500">{s.location}</p>
                            </td>
                            <td className="px-4 py-2.5 text-center text-[12px] font-bold tabular-nums text-slate-700">
                              {s.guards}
                            </td>
                            <td className="px-4 py-2.5 text-center text-[13px] font-black tabular-nums text-violet-800">
                              {s.shiftsProvided}
                            </td>
                            <td
                              className={`px-4 py-2.5 text-center text-[13px] font-black tabular-nums ${
                                hasVariance ? 'text-amber-800' : 'text-slate-700'
                              }`}
                            >
                              {s.shiftsClientRequested}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t border-slate-200/70 bg-slate-50/40">
                      <tr>
                        <td className="px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                          All Sites
                        </td>
                        <td className="px-4 py-2.5 text-center text-[12px] font-black tabular-nums text-slate-700">
                          {siteRollups.reduce((sum, row) => sum + row.guards, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[13px] font-black tabular-nums text-violet-900">
                          {siteRollups.reduce((sum, row) => sum + row.shiftsProvided, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[13px] font-black tabular-nums text-slate-800">
                          {siteRollups.reduce((sum, row) => sum + row.shiftsClientRequested, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </>
                )}
              </RollupTable>
            </div>

            <p className="text-[11px] font-medium text-slate-500">
              Shifts provided = confirmed SM attendance, verified check-ins, and approved pairs for
              the month, plus FM shift adjustments. Client requested = site staffing requirement ×
              SO working days from MD payroll settings.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RollupTable({
  title,
  icon,
  badge,
  badgeClass,
  emptyMessage,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge: string;
  badgeClass: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/70 bg-slate-50/50 px-5 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">{title}</p>
          <span
            className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-black ${badgeClass}`}
          >
            {badge}
          </span>
        </div>
      </div>
      {children ? (
        <table className="w-full text-left">{children}</table>
      ) : (
        <p className="px-5 py-8 text-sm font-semibold text-slate-500">{emptyMessage}</p>
      )}
    </ExecutiveGlassCard>
  );
}
