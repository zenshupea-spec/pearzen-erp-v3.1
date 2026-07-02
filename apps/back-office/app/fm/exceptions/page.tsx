'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

import StaffPortalLoading from '../../../components/portal/StaffPortalLoading';
import FmSubnav from '../components/FmSubnav';
import FmHrPayrollExceptionRadar from '../components/FmHrPayrollExceptionRadar';
import {
  fetchFmHrPayrollExceptions,
  type ResignationDebtRecord,
  type SalaryOverrideRecord,
} from '../fm-payroll-exceptions-actions';

export default function FmPayrollExceptionsPage() {
  const [overrides, setOverrides] = useState<SalaryOverrideRecord[]>([]);
  const [debts, setDebts] = useState<ResignationDebtRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchFmHrPayrollExceptions().then(({ overrides: o, debts: d }) => {
      setOverrides(o);
      setDebts(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pendingOverrides = overrides.filter((o) => o.status === 'PENDING').length;
  const actionCount =
    pendingOverrides + debts.filter((d) => d.status !== 'WRITTEN_OFF').length;

  return (
    <div className="min-h-screen pb-24 font-sans">
      <FmSubnav />

      <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-12 2xl:px-24 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Finance Manager
            </p>
            <h1 className="mt-1 text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
              HR &amp; Payroll Exceptions
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">
              Approve custom salaries that bypass rank defaults and clear termination debt after
              recovery is confirmed in Payroll.
            </p>
          </div>
          {actionCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Requires FM action
            </span>
          )}
        </div>

        {loading ? (
          <StaffPortalLoading portal="fm" message="Loading exception queue…" className="min-h-[16rem]" />
        ) : (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">
                Exception radar
              </h2>
              <span className="flex items-center gap-1 rounded-full border border-indigo-200/70 bg-indigo-50/60 px-2 py-0.5 text-[9px] font-black text-indigo-800">
                FM action queue
              </span>
            </div>
            <FmHrPayrollExceptionRadar
              overrides={overrides}
              debts={debts}
              onRefresh={refresh}
            />
          </section>
        )}
      </div>
    </div>
  );
}
