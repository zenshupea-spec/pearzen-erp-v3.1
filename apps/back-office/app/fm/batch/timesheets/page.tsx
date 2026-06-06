'use client';

import { MapPin, TrendingUp, Users } from 'lucide-react';
import FmSubnav from '../../components/FmSubnav';
import { ExecutiveGlassCard } from '../../../../components/executive/ExecutiveVaultShell';
import { BATCH_TIMESHEET_PERIOD, SITE_ROLLUPS, SM_ROLLUPS } from '../../lib/batch-timesheet-data';

export default function FmBatchTimesheetsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FmSubnav />

        <div className="mb-6">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Timesheet Reconciliation Totals
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Sector manager and site roll-ups for {BATCH_TIMESHEET_PERIOD} batch payroll
          </p>
        </div>

        <div className="space-y-8">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-600" />
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">
              Attendance roll-ups — {BATCH_TIMESHEET_PERIOD}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ExecutiveGlassCard className="overflow-hidden">
              <div className="border-b border-slate-200/70 bg-slate-50/50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-600" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                    SM-Wise (Sector Totals)
                  </p>
                  <span className="ml-auto rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                    {SM_ROLLUPS.length} sectors
                  </span>
                </div>
              </div>
              <table className="w-full text-left">
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
                  {SM_ROLLUPS.map((s) => (
                    <tr key={s.sm} className="transition-colors hover:bg-white/40">
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
                      {SM_ROLLUPS.reduce((s, r) => s + r.guards, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-[13px] font-black tabular-nums text-emerald-900">
                      {SM_ROLLUPS.reduce((s, r) => s + r.totalShifts, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-center text-[12px] font-semibold tabular-nums text-slate-600">
                      {(SM_ROLLUPS.reduce((s, r) => s + r.avgShifts, 0) / SM_ROLLUPS.length).toFixed(1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </ExecutiveGlassCard>

            <ExecutiveGlassCard className="overflow-hidden">
              <div className="border-b border-slate-200/70 bg-slate-50/50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-violet-600" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                    Site-Wise (Location Totals)
                  </p>
                  <span className="ml-auto rounded-full border border-violet-200/80 bg-violet-50/80 px-2 py-0.5 text-[10px] font-black text-violet-800">
                    {SITE_ROLLUPS.length} sites
                  </span>
                </div>
              </div>
              <table className="w-full text-left">
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
                  {SITE_ROLLUPS.map((s) => {
                    const hasVariance = s.shiftsProvided !== s.shiftsClientRequested;
                    return (
                      <tr
                        key={s.site}
                        className={`transition-colors ${
                          hasVariance ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-white/40'
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
                      {SITE_ROLLUPS.reduce((s, r) => s + r.guards, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-[13px] font-black tabular-nums text-violet-900">
                      {SITE_ROLLUPS.reduce((s, r) => s + r.shiftsProvided, 0)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-[13px] font-black tabular-nums text-slate-800">
                      {SITE_ROLLUPS.reduce((s, r) => s + r.shiftsClientRequested, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </ExecutiveGlassCard>
          </div>
        </div>
      </div>
    </div>
  );
}
