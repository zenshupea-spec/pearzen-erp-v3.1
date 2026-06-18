'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Receipt, Save, X } from 'lucide-react';
import {
  getEmployeeDeductionAudit,
  saveFmEmployeeDeductionPlan,
} from '../fm-deduction-plans-actions';
import {
  computeInstallmentSchedule,
  FM_GRANULAR_DEDUCTION_KINDS,
  payrollMonthDate,
  type FmDeductionAuditRow,
  type FmGranularDeductionLabel,
} from '../lib/fm-employee-deduction-plans';
import type { PayrollPeriod } from '../lib/payroll-period';

const lkr = (n: number) =>
  'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ROW_COLOR: Record<string, string> = {
  Meals: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  Uniform: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  Advance: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  Penalty: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  'Death Donation': 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  'Wedding Gifts': 'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
  'Extra Items': 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  'Unit Damages': 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  Training: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  'Salary Loan': 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  'Other Deductions': 'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
};

type DraftRow = {
  totalLiability: string;
  installmentTotal: string;
};

function isFmEditable(type: FmDeductionAuditRow['type']): type is FmGranularDeductionLabel {
  return FM_GRANULAR_DEDUCTION_KINDS.some((entry) => entry.label === type);
}

function payrollMonthBefore(period: PayrollPeriod, monthsBack: number): string {
  let year = period.year;
  let month = period.month - monthsBack;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function previewThisMonthAmount(
  row: FmDeductionAuditRow,
  draft: DraftRow | undefined,
  payrollPeriod: PayrollPeriod,
  useDraft: boolean,
): number {
  if (!useDraft || !row.editable || !draft) return row.thisMonthAmount;

  const total = Math.round(parseFloat(draft.totalLiability) || 0);
  const installments = Math.max(1, parseInt(draft.installmentTotal, 10) || 1);
  if (total <= 0) return 0;

  const startPayrollMonth =
    row.installmentCurrent > 0
      ? payrollMonthBefore(payrollPeriod, row.installmentCurrent - 1)
      : payrollMonthDate(payrollPeriod);

  const schedule = computeInstallmentSchedule(
    {
      totalLiabilityLkr: total,
      installmentTotal: installments,
      startPayrollMonth,
      status: 'ACTIVE',
    },
    payrollPeriod,
  );

  return schedule?.thisMonthAmount ?? 0;
}

export default function FmDeductionsModal({
  employeeId,
  employeeName,
  employeeNumber,
  totalGross,
  payrollPeriod,
  payrollLocked,
  onClose,
  onSaved,
}: {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  totalGross: number;
  payrollPeriod: PayrollPeriod;
  payrollLocked: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<FmDeductionAuditRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getEmployeeDeductionAudit({ employeeId, payrollPeriod });
    setRows(result.rows);
    const nextDrafts: Record<string, DraftRow> = {};
    for (const row of result.rows) {
      if (!row.editable) continue;
      nextDrafts[row.type] = {
        totalLiability: row.totalLiability > 0 ? String(row.totalLiability) : '',
        installmentTotal: String(Math.max(1, row.installmentTotal || 1)),
      };
    }
    setDrafts(nextDrafts);
    setLoading(false);
  }, [employeeId, payrollPeriod]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayRows = useMemo(
    () =>
      rows.map((row) => {
        const editable = row.editable && !payrollLocked;
        const draft = drafts[row.type];
        return {
          ...row,
          thisMonthAmount: previewThisMonthAmount(row, draft, payrollPeriod, editable),
        };
      }),
    [rows, drafts, payrollPeriod, payrollLocked],
  );

  const totalThisMonth = useMemo(
    () => displayRows.reduce((sum, row) => sum + row.thisMonthAmount, 0),
    [displayRows],
  );
  const netTakeHome = Math.max(0, totalGross - totalThisMonth);

  const updateDraft = (type: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => ({
      ...prev,
      [type]: { totalLiability: '', installmentTotal: '1', ...prev[type], ...patch },
    }));
  };

  const saveFmRows = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    for (const row of rows) {
      if (!row.editable || !isFmEditable(row.type)) continue;
      const draft = drafts[row.type];
      if (!draft) continue;

      const totalLiabilityLkr = Math.round(parseFloat(draft.totalLiability) || 0);
      const installmentTotal = Math.max(1, parseInt(draft.installmentTotal, 10) || 1);
      const changed =
        totalLiabilityLkr !== row.totalLiability ||
        installmentTotal !== row.installmentTotal ||
        (totalLiabilityLkr <= 0 && row.planId);

      if (!changed) continue;

      const result = await saveFmEmployeeDeductionPlan({
        employeeId,
        payrollPeriod,
        deductionLabel: row.type,
        totalLiabilityLkr,
        installmentTotal,
        cancel: totalLiabilityLkr <= 0,
      });

      if (!result.success) {
        setSaving(false);
        setError(result.error ?? `Could not save ${row.type}.`);
        return;
      }
    }

    await load();
    onSaved();
    setSaving(false);
    setMessage('Deduction schedule saved.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50">
              <Receipt className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Deductions Audit</p>
              <p className="text-[11px] text-slate-500">
                {employeeName} · {employeeNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Gross Salary
            </p>
            <p className="mt-1 font-mono text-base font-black text-slate-900">{lkr(totalGross)}</p>
          </div>
        </div>

        {payrollLocked && (
          <div className="border-b border-amber-100 bg-amber-50 px-6 py-3 text-[11px] font-semibold text-amber-900">
            Payroll is locked — FM deduction plans cannot be edited until the batch returns to draft.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Active Deduction Schedule
          </p>
          <p className="mb-4 text-xs text-slate-500">
            Meals, uniform, and salary advance come from HQ admin / advance runs (read-only). FM
            installment deductions carry forward each month until completed.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading deductions…
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Total Liability
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Instalment Plan
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      This Month
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayRows.map((row) => {
                    const draft = drafts[row.type];
                    const editable = row.editable && !payrollLocked;
                    const previewInstallmentCurrent =
                      row.installmentCurrent > 0
                        ? row.installmentCurrent
                        : parseFloat(draft?.totalLiability ?? '') > 0
                          ? 1
                          : 0;
                    return (
                      <tr key={row.type} className="align-top transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${ROW_COLOR[row.type] ?? 'bg-slate-100 text-slate-700'}`}
                          >
                            {row.type}
                          </span>
                          {row.source === 'hq' && (
                            <p className="mt-1 text-[10px] font-semibold text-slate-400">HQ admin</p>
                          )}
                          {row.source === 'system' && (
                            <p className="mt-1 text-[10px] font-semibold text-slate-400">
                              Advance run
                            </p>
                          )}
                          {row.editable && (
                            <p className="mt-1 text-[10px] font-semibold text-indigo-600">FM only</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editable ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={draft?.totalLiability ?? ''}
                              onChange={(e) =>
                                updateDraft(row.type, { totalLiability: e.target.value })
                              }
                              placeholder="0"
                              className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right font-mono text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                          ) : (
                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {row.totalLiability > 0 ? lkr(row.totalLiability) : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {editable ? (
                            <div className="inline-flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-500">of</span>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={draft?.installmentTotal ?? '1'}
                                onChange={(e) =>
                                  updateDraft(row.type, { installmentTotal: e.target.value })
                                }
                                className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center font-mono text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200"
                              />
                              {previewInstallmentCurrent > 0 && (
                                <span className="text-[10px] font-bold text-slate-500">
                                  · month {previewInstallmentCurrent}
                                </span>
                              )}
                            </div>
                          ) : row.thisMonthAmount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                              Month {Math.max(1, row.installmentCurrent)} of{' '}
                              {Math.max(1, row.installmentTotal)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-black text-red-600">
                          {row.thisMonthAmount > 0 ? `− ${lkr(row.thisMonthAmount)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-red-50">
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-red-600"
                    >
                      Total Deducted This Month
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-black text-red-700">
                      − {lkr(totalThisMonth)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-emerald-50">
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-emerald-700"
                    >
                      Net Take-Home
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-800">
                      {lkr(netTakeHome)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {error ? <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p> : null}
          {message ? <p className="mt-3 text-xs font-semibold text-emerald-700">{message}</p> : null}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-6 py-3">
          {!payrollLocked && !loading ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveFmRows()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save FM deductions
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
