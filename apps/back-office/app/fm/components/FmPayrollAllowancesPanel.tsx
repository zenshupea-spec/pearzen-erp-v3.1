'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { saveFmPayrollEarningsAdjustment } from '../portfolio-actions';
import {
  EMPTY_FIXED_ALLOWANCES,
  EMPTY_VARIABLE_EARNINGS,
  inferBasePayLkr,
  sumFixedAllowances,
  sumVariableEarnings,
  totalGrossFromPayParts,
  type FixedMonthlyAllowances,
  type VariablePayrollEarnings,
} from '../lib/payroll-earnings-display';
import type { PayrollPeriod } from '../lib/payroll-period';

const lkr = (n: number) =>
  'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type AllowancesEmployee = {
  id: string;
  totalGross: number;
  totalDeductions: number;
  earnings: {
    basePayLkr?: number;
    fixedAllowances?: FixedMonthlyAllowances;
    variableEarnings?: VariablePayrollEarnings;
  };
};

export function previewEmployeePayTotals(
  employee: AllowancesEmployee,
  variableEarnings: VariablePayrollEarnings,
  fixedAllowancesOverride?: FixedMonthlyAllowances,
) {
  const fixedAllowances = fixedAllowancesOverride ?? employee.earnings.fixedAllowances ?? EMPTY_FIXED_ALLOWANCES;
  const basePayLkr =
    employee.earnings.basePayLkr ??
    inferBasePayLkr(employee.totalGross, fixedAllowances, employee.earnings.variableEarnings);
  const totalGross = totalGrossFromPayParts(basePayLkr, fixedAllowances, variableEarnings);
  return {
    totalGross,
    netTakeHome: Math.max(0, totalGross - employee.totalDeductions),
    fixedAllowances,
  };
}

export default function FmPayrollAllowancesPanel({
  employee,
  payrollPeriod,
  payrollLocked,
  onSaved,
}: {
  employee: AllowancesEmployee;
  payrollPeriod: PayrollPeriod;
  payrollLocked: boolean;
  onSaved: (
    variableEarnings: VariablePayrollEarnings,
    totals: { totalGross: number; netTakeHome: number },
    fixedAllowances: FixedMonthlyAllowances,
  ) => void;
}) {
  const savedFixed = employee.earnings.fixedAllowances ?? EMPTY_FIXED_ALLOWANCES;
  const savedVariable = employee.earnings.variableEarnings ?? EMPTY_VARIABLE_EARNINGS;
  const [siteAllowanceInput, setSiteAllowanceInput] = useState(
    savedFixed.siteAllowanceLkr > 0 ? String(savedFixed.siteAllowanceLkr) : '',
  );
  const [arrearsInput, setArrearsInput] = useState(
    savedVariable.arrearsLkr > 0 ? String(savedVariable.arrearsLkr) : '',
  );
  const [incentiveInput, setIncentiveInput] = useState(
    savedVariable.performanceIncentiveLkr > 0 ? String(savedVariable.performanceIncentiveLkr) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSiteAllowanceInput(savedFixed.siteAllowanceLkr > 0 ? String(savedFixed.siteAllowanceLkr) : '');
    setArrearsInput(savedVariable.arrearsLkr > 0 ? String(savedVariable.arrearsLkr) : '');
    setIncentiveInput(
      savedVariable.performanceIncentiveLkr > 0 ? String(savedVariable.performanceIncentiveLkr) : '',
    );
  }, [
    employee.id,
    savedFixed.siteAllowanceLkr,
    savedVariable.arrearsLkr,
    savedVariable.performanceIncentiveLkr,
  ]);

  const draftFixedAllowances = useMemo(
    (): FixedMonthlyAllowances => ({
      siteAllowanceLkr: Math.max(0, Math.round(parseFloat(siteAllowanceInput) || 0)),
      mealAllowanceLkr: 0,
      transportAllowanceLkr: 0,
    }),
    [siteAllowanceInput],
  );

  const draftVariable = useMemo(
    (): VariablePayrollEarnings => ({
      arrearsLkr: Math.max(0, Math.round(parseFloat(arrearsInput) || 0)),
      performanceIncentiveLkr: Math.max(0, Math.round(parseFloat(incentiveInput) || 0)),
    }),
    [arrearsInput, incentiveInput],
  );

  const previewTotals = useMemo(
    () => previewEmployeePayTotals(employee, draftVariable, draftFixedAllowances),
    [employee, draftVariable, draftFixedAllowances],
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const result = await saveFmPayrollEarningsAdjustment({
      employeeId: employee.id,
      payrollPeriod,
      siteAllowanceLkr: draftFixedAllowances.siteAllowanceLkr,
      arrearsLkr: draftVariable.arrearsLkr,
      performanceIncentiveLkr: draftVariable.performanceIncentiveLkr,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save payroll earnings.');
      return;
    }
    onSaved(draftVariable, previewTotals, draftFixedAllowances);
    setMessage('Payroll earnings saved.');
  };

  return (
    <div className="border-b border-slate-100 px-6 py-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
        Site Allowance (FM)
      </p>
      <div className="overflow-hidden rounded-xl border border-emerald-200/70 bg-emerald-50/20">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="px-4 py-3 text-xs font-semibold text-slate-600">Site Allowance</td>
              <td className="px-4 py-3 text-right">
                {payrollLocked ? (
                  <span className="font-mono text-xs font-bold text-slate-900">
                    {draftFixedAllowances.siteAllowanceLkr > 0
                      ? lkr(draftFixedAllowances.siteAllowanceLkr)
                      : '—'}
                  </span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={siteAllowanceInput}
                    onChange={(e) => setSiteAllowanceInput(e.target.value)}
                    placeholder="0"
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right font-mono text-xs text-slate-900 outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                )}
              </td>
            </tr>
            <tr className="border-t border-emerald-100/80 bg-white/60">
              <td className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                Fixed total
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs font-black text-emerald-700">
                {sumFixedAllowances(draftFixedAllowances) > 0
                  ? lkr(sumFixedAllowances(draftFixedAllowances))
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] font-medium text-slate-500">
        Set here each month — included on payroll and payslip. Meal and transport are not used.
      </p>

      <p className="mb-3 mt-6 text-[10px] font-bold uppercase tracking-widest text-indigo-700">
        Variable Earnings (FM — this month)
      </p>
      <div className="overflow-hidden rounded-xl border border-indigo-200/70 bg-indigo-50/20">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-indigo-100/80">
            <tr>
              <td className="px-4 py-3 text-xs font-semibold text-slate-600">Arrears</td>
              <td className="px-4 py-3 text-right">
                {payrollLocked ? (
                  <span className="font-mono text-xs font-bold text-slate-900">
                    {draftVariable.arrearsLkr > 0 ? lkr(draftVariable.arrearsLkr) : '—'}
                  </span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={arrearsInput}
                    onChange={(e) => setArrearsInput(e.target.value)}
                    placeholder="0"
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right font-mono text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                )}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                Performance incentive
              </td>
              <td className="px-4 py-3 text-right">
                {payrollLocked ? (
                  <span className="font-mono text-xs font-bold text-slate-900">
                    {draftVariable.performanceIncentiveLkr > 0
                      ? lkr(draftVariable.performanceIncentiveLkr)
                      : '—'}
                  </span>
                ) : (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={incentiveInput}
                    onChange={(e) => setIncentiveInput(e.target.value)}
                    placeholder="0"
                    className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right font-mono text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                )}
              </td>
            </tr>
            <tr className="bg-white/60">
              <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-indigo-700">
                Variable total
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs font-black text-indigo-700">
                {sumVariableEarnings(draftVariable) > 0
                  ? lkr(sumVariableEarnings(draftVariable))
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Preview total gross
          </span>
          <span className="font-mono text-sm font-black text-emerald-700">
            {lkr(previewTotals.totalGross)}
          </span>
        </div>
      </div>

      {error ? <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p> : null}
      {message ? <p className="mt-3 text-xs font-semibold text-emerald-700">{message}</p> : null}

      {!payrollLocked ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save payroll earnings
        </button>
      ) : null}
    </div>
  );
}
