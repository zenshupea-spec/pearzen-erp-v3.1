'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Loader2, Printer } from 'lucide-react';
import type { FmPayrollRosterRow } from '../lib/fm-payroll-roster-data';
import {
  buildPayslipHistoryEntries,
  inferHistoricalBankAdvancePaid,
  inferHistoricalBankSalaryPaid,
  inferHistoricalCashPaid,
  periodWorkflowKey,
  rosterWorkflowMap,
  showAdvancePaymentForRow,
  usesBankExportForGroup,
  type RosterPeriodWorkflowSnapshot,
} from '../lib/fm-roster-payslip-history';
import { useRosterCashPaid } from '../lib/use-roster-cash-paid';
import {
  downloadPayslipPdf,
  openPayslipPrint,
} from '../lib/fm-payslip-document';
import { getRosterWorkflowSnapshots } from '../roster-workflow-actions';
import type { PayrollPeriod } from '../lib/payroll-period';
import { usesCohortBankDownload } from '../lib/guard-payroll-cohorts';
import { cashPaymentStatus } from '../lib/roster-cash-paid-store';
import { FmCashPaymentModal, type CashPaymentKind } from './FmCashPaymentModal';
import {
  FmRosterAdvancePaymentStatus,
  FmRosterSalaryPaymentStatus,
  bankAdvancePaidFromWorkflow,
  bankSalaryPaidFromWorkflow,
  isAdvanceCashSettled,
  isSalaryCashSettled,
} from './FmRosterPaymentStatus';

function lkr(n: number) {
  return (
    'LKR ' +
    n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export default function FmRosterPayslipHistoryPanel({
  row,
  anchorPeriod,
  onPreview,
}: {
  row: FmPayrollRosterRow;
  anchorPeriod: PayrollPeriod;
  onPreview: (historyRow: FmPayrollRosterRow, periodLabel: string) => void;
}) {
  const entries = useMemo(
    () => buildPayslipHistoryEntries(row, anchorPeriod),
    [row, anchorPeriod],
  );
  const [workflows, setWorkflows] = useState<RosterPeriodWorkflowSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashModal, setCashModal] = useState<{
    period: PayrollPeriod;
    dueLkr: number;
    kind: CashPaymentKind;
    title: string;
  } | null>(null);
  const cashPaid = useRosterCashPaid(row.id);
  const usesCohortExport = usesCohortBankDownload(row.payrollGroup);
  const showAdvanceColumn = entries.some((entry) =>
    showAdvancePaymentForRow(row.payrollGroup, entry.advanceAmountLkr),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getRosterWorkflowSnapshots(anchorPeriod, row.payrollGroup, entries.length).then(
      (snapshots) => {
        if (cancelled) return;
        setWorkflows(snapshots);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [anchorPeriod, row.payrollGroup, entries.length]);

  const workflowByPeriod = useMemo(() => rosterWorkflowMap(workflows), [workflows]);

  return (
    <>
      {cashModal && (
        <FmCashPaymentModal
          open
          onClose={() => setCashModal(null)}
          employeeId={row.id}
          employeeName={row.name}
          employeeNumber={row.empNumber}
          period={cashModal.period}
          dueLkr={cashModal.dueLkr}
          kind={cashModal.kind}
          title={cashModal.title}
        />
      )}
    <tr className="bg-slate-50/90">
      <td colSpan={8} className="px-4 py-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Payslip history — {row.name} · latest to oldest
            </p>
            {loading && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading payment status…
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Period
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Net
                  </th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Salary payment
                  </th>
                  {showAdvanceColumn && (
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Advance payment
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Payslip
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => {
                  const snapshot = workflowByPeriod.get(periodWorkflowKey(entry.period));
                  const historicalSalaryPaid = inferHistoricalBankSalaryPaid(
                    entry.period,
                    row.payrollGroup,
                  );
                  const historicalAdvancePaid = inferHistoricalBankAdvancePaid(entry.period);
                  const historicalCashPaid = inferHistoricalCashPaid(entry.period);
                  const cohortExported =
                    row.payrollGroup != null &&
                    cashPaid.isCohortExported(row.payrollGroup, entry.period);

                  const salaryDueLkr = entry.row.netPayLkr;
                  const advanceDueLkr = entry.advanceAmountLkr;
                  const salaryCashRecord = cashPaid.salaryRecord(entry.period, salaryDueLkr);
                  const advanceCashRecord = cashPaid.advanceRecord(entry.period, advanceDueLkr);

                  const salaryPaid =
                    entry.channel === 'cash'
                      ? isSalaryCashSettled(salaryCashRecord, salaryDueLkr, historicalCashPaid)
                      : bankSalaryPaidFromWorkflow(
                          snapshot?.payrollPaidAt,
                          historicalSalaryPaid,
                          usesCohortExport,
                          cohortExported,
                        );

                  const advancePaid =
                    entry.channel === 'cash'
                      ? isAdvanceCashSettled(
                          advanceCashRecord,
                          advanceDueLkr,
                          historicalCashPaid,
                        )
                      : bankAdvancePaidFromWorkflow(
                          snapshot?.advancePaidAt,
                          historicalAdvancePaid,
                        );

                  const salaryCashStatus =
                    entry.channel === 'cash'
                      ? cashPaymentStatus(salaryCashRecord, salaryDueLkr)
                      : null;

                  const showAdvance = showAdvancePaymentForRow(
                    row.payrollGroup,
                    entry.advanceAmountLkr,
                  );

                  return (
                    <tr key={periodWorkflowKey(entry.period)} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <p className="text-xs font-bold text-slate-900">{entry.periodLabel}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {entry.row.payslipId}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-black text-emerald-700">
                        {lkr(entry.row.netPayLkr)}
                      </td>
                      <td className="overflow-visible px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-center gap-1.5 overflow-visible">
                          <FmRosterSalaryPaymentStatus
                            channel={entry.channel}
                            paid={salaryPaid}
                            employeeId={row.id}
                            period={entry.period}
                            dueLkr={salaryDueLkr}
                            cashRecord={salaryCashRecord}
                            workflowStatus={snapshot?.payrollStatus}
                            usesCohortExport={usesCohortExport}
                            onOpenCashPayment={() =>
                              setCashModal({
                                period: entry.period,
                                dueLkr: salaryDueLkr,
                                kind: 'salary',
                                title: `Salary · ${entry.periodLabel}`,
                              })
                            }
                          />
                          {salaryCashStatus === 'partial' && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700">
                              {salaryDueLkr > 0
                                ? `${Math.round((salaryCashRecord.amountPaidLkr / salaryDueLkr) * 100)}% paid`
                                : null}
                            </span>
                          )}
                          {entry.channel === 'bank' &&
                            usesBankExportForGroup(row.payrollGroup) &&
                            snapshot?.payrollStatus === 'APPROVED' &&
                            !salaryPaid &&
                            usesCohortExport && (
                              <button
                                type="button"
                                onClick={() =>
                                  row.payrollGroup &&
                                  cashPaid.markCohortExported(row.payrollGroup, entry.period)
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-600 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-emerald-500"
                              >
                                <Download className="h-3 w-3" />
                                Bank .TXT
                              </button>
                            )}
                        </div>
                      </td>
                      {showAdvanceColumn && (
                        <td className="overflow-visible px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          {showAdvance ? (
                            <div className="flex flex-col items-center gap-1 overflow-visible">
                              <span className="font-mono text-[10px] font-bold text-violet-800">
                                − {lkr(entry.advanceAmountLkr)}
                              </span>
                              <FmRosterAdvancePaymentStatus
                                channel={entry.channel}
                                paid={advancePaid}
                                employeeId={row.id}
                                period={entry.period}
                                dueLkr={advanceDueLkr}
                                cashRecord={advanceCashRecord}
                                workflowStatus={snapshot?.advanceStatus}
                                onOpenCashPayment={() =>
                                  setCashModal({
                                    period: entry.period,
                                    dueLkr: advanceDueLkr,
                                    kind: 'advance',
                                    title: `Advance · ${entry.periodLabel}`,
                                  })
                                }
                              />
                            </div>
                          ) : (
                            <span className="block text-center text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center justify-center gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            title="View payslip"
                            onClick={() => onPreview(entry.row, entry.periodLabel)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Print payslip"
                            onClick={() => openPayslipPrint(entry.row, entry.periodLabel)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Download PDF"
                            onClick={() => void downloadPayslipPdf(entry.row, entry.periodLabel)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
    </>
  );
}
