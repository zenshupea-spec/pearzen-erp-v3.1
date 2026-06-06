'use client';

import { useTransition } from 'react';
import { updateGlobalSettings, updateRankBasicSalary } from './actions';

interface SettingsProps {
  initialSettings: any;
  rankStats: { rank: string; basic_salary: number }[];
  companyId: string;
}

const glassPanel =
  'rounded-2xl border border-white/75 bg-white/55 p-6 shadow-[0_12px_48px_-14px_rgba(15,23,42,0.12)] backdrop-blur-2xl backdrop-saturate-[1.35] ring-1 ring-slate-900/[0.045]';

const inputBase =
  'w-full rounded-lg border border-slate-200 bg-white/95 px-4 py-2 text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

const labelBase = 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600';

export default function SettingsClient({ initialSettings, rankStats, companyId }: SettingsProps) {
  const [isPending, startTransition] = useTransition();

  const handleSettingsSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateGlobalSettings(companyId, formData);
      if (!res.success) alert(`ENGINE SYNC FAILED: ${res.error}`);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className={glassPanel}>
        <h2 className="mb-6 text-xl font-bold uppercase tracking-tight text-slate-900">
          Financial Engine Constants
        </h2>
        <form onSubmit={handleSettingsSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelBase}>SSCL RATE (%)</label>
              <input
                name="sscl_rate"
                type="number"
                step="0.01"
                defaultValue={initialSettings.sscl_rate || 0}
                className={inputBase}
              />
            </div>
            <div>
              <label className={labelBase}>VAT RATE (%)</label>
              <input
                name="vat_rate"
                type="number"
                step="0.01"
                defaultValue={initialSettings.vat_rate || 0}
                className={inputBase}
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-200/90 pt-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-800">
              Wages Board Ordinance (Security)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={`${labelBase} font-normal`}>DAYS</label>
                <input
                  name="wb_working_days"
                  type="number"
                  defaultValue={initialSettings.wb_working_days || 26}
                  className={`${inputBase} px-3 text-sm`}
                />
              </div>
              <div>
                <label className={`${labelBase} font-normal`}>HOURS</label>
                <input
                  name="wb_hours"
                  type="number"
                  defaultValue={initialSettings.wb_hours || 200}
                  className={`${inputBase} px-3 text-sm`}
                />
              </div>
              <div>
                <label className={`${labelBase} font-normal`}>OT RATE</label>
                <input
                  name="wb_ot_multiplier"
                  type="number"
                  step="0.1"
                  defaultValue={initialSettings.wb_ot_multiplier || 1.5}
                  className={`${inputBase} px-3 text-sm`}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-200/90 pt-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-800">
              Shop & Office Employees Act (Hospitality)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={`${labelBase} font-normal`}>DAYS</label>
                <input
                  name="so_working_days"
                  type="number"
                  defaultValue={initialSettings.so_working_days || 20}
                  className={`${inputBase} px-3 text-sm focus:ring-emerald-500/40`}
                />
              </div>
              <div>
                <label className={`${labelBase} font-normal`}>HOURS</label>
                <input
                  name="so_hours"
                  type="number"
                  defaultValue={initialSettings.so_hours || 180}
                  className={`${inputBase} px-3 text-sm focus:ring-emerald-500/40`}
                />
              </div>
              <div>
                <label className={`${labelBase} font-normal`}>OT RATE</label>
                <input
                  name="so_ot_multiplier"
                  type="number"
                  step="0.1"
                  defaultValue={initialSettings.so_ot_multiplier || 1.5}
                  className={`${inputBase} px-3 text-sm focus:ring-emerald-500/40`}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-indigo-600 py-3 font-bold uppercase tracking-widest text-white shadow-lg shadow-indigo-900/15 transition-all hover:bg-indigo-500 disabled:opacity-50"
          >
            {isPending ? 'COMMITTING ENGINE CHANGES...' : 'Save Engine Constants'}
          </button>
        </form>
      </div>

      <div className={glassPanel}>
        <h2 className="mb-6 text-xl font-bold uppercase tracking-tight text-slate-900">
          Rank & Compensation Matrix
        </h2>
        <div className="space-y-4">
          {rankStats.length === 0 ? (
            <p className="font-mono text-sm italic text-slate-500">
              NO PERSONNEL RECORDED IN MASTER NOMINAL ROLL.
            </p>
          ) : (
            rankStats.map((stat) => (
              <form
                key={stat.rank}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  startTransition(async () => {
                    const res = await updateRankBasicSalary(companyId, stat.rank, fd);
                    if (!res.success) alert(res.error);
                  });
                }}
                className="group flex items-end gap-4 rounded-xl border border-slate-200/90 bg-slate-50/80 p-4 transition-all hover:border-emerald-300/80 hover:bg-white/70"
              >
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600 transition-colors group-hover:text-emerald-800">
                    {stat.rank}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 font-mono text-xs text-slate-500">LKR</span>
                    <input
                      name="basic_salary"
                      type="number"
                      defaultValue={stat.basic_salary}
                      className="w-full rounded-lg border border-slate-200 bg-white/95 py-2 pl-12 pr-4 text-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-emerald-500 disabled:opacity-50"
                >
                  SYNC
                </button>
              </form>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
