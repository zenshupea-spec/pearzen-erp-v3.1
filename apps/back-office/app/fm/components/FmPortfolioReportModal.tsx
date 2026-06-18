'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Lock, Printer, X } from 'lucide-react';
import type { PayrollWorkflowStatus } from '../../../lib/payroll-batch-workflow';
import {
  buildClientBillingRows,
  buildStatutoryApitReport,
  buildTableHtml,
  calculateEmployeeStatutory,
  flattenPortfolioEmployees,
  reportMeta,
  requiresMdApprovalForExport,
  sumDeductionByType,
  type FmPortfolioReportKind,
  type FmReportSite,
  lkr,
} from '../lib/fm-portfolio-report-builders';
import { downloadFmA4Pdf, openFmA4Report } from '../lib/fm-report-print';
import FmRetentionListTable from './FmRetentionListTable';
import {
  FM_PREV_MONTH_STOP_LIST,
  FM_SALARY_MONTH_HALF_HOLD_LIST,
} from '../lib/retention-lists';

type FmPortfolioReportModalProps = {
  kind: FmPortfolioReportKind;
  sites: FmReportSite[];
  workflowStatus: PayrollWorkflowStatus;
  periodLabel: string;
  isLivePeriod?: boolean;
  onClose: () => void;
};

function workflowExportBlocked(status: PayrollWorkflowStatus) {
  return status !== 'APPROVED';
}

function exportGateMessage(status: PayrollWorkflowStatus) {
  if (status === 'APPROVED') return null;
  if (status === 'SUBMITTED_FOR_REVIEW') {
    return 'Print and PDF export unlock after MD approves the payroll batch you locked and sent for review.';
  }
  return 'Lock payroll and send to MD for review from the Payroll Ledger, then export unlocks once MD approves.';
}

export default function FmPortfolioReportModal({
  kind,
  sites,
  workflowStatus,
  periodLabel,
  isLivePeriod = true,
  onClose,
}: FmPortfolioReportModalProps) {
  const [exporting, setExporting] = useState(false);
  const meta = reportMeta(kind);
  const needsApproval = requiresMdApprovalForExport(kind);
  const exportBlocked = needsApproval && workflowExportBlocked(workflowStatus);
  const gateMsg = needsApproval ? exportGateMessage(workflowStatus) : null;

  const employees = useMemo(() => flattenPortfolioEmployees(sites), [sites]);
  const clientRows = useMemo(() => buildClientBillingRows(sites), [sites]);
  const printTables = useMemo(() => buildTableHtml(kind, sites), [kind, sites]);

  const handlePrint = () => {
    if (exportBlocked) return;
    openFmA4Report({
      title: meta.title,
      subtitle: meta.subtitle,
      period: periodLabel,
      tableHeadHtml: printTables.head,
      tableBodyHtml: printTables.body,
      contentHtml: printTables.contentHtml,
      footerNote: needsApproval
        ? 'Released after MD approval of locked security payroll batch.'
        : undefined,
    });
  };

  const handlePdf = async () => {
    if (exportBlocked) return;
    setExporting(true);
    try {
      await downloadFmA4Pdf({
        filename: `fm-${kind}-${periodLabel.replace(/\s+/g, '-')}.pdf`,
        title: meta.title,
        subtitle: meta.subtitle,
        period: periodLabel,
        tableHeadHtml: printTables.head,
        tableBodyHtml: printTables.body,
        contentHtml: printTables.contentHtml,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">{meta.title}</p>
              <p className="text-[11px] text-slate-500">
                {meta.subtitle} · {periodLabel}
                {!isLivePeriod ? ' (historical)' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {gateMsg && (
          <div className="flex flex-shrink-0 items-start gap-3 border-b border-amber-100 bg-amber-50 px-6 py-3">
            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-amber-900">Export locked until MD approval</p>
              <p className="mt-0.5 text-[11px] text-amber-800">{gateMsg}</p>
              <Link
                href="/fm"
                className="mt-1 inline-block text-[11px] font-bold text-amber-900 underline"
              >
                Open Payroll Ledger →
              </Link>
            </div>
          </div>
        )}

        {workflowStatus === 'APPROVED' && needsApproval && (
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-6 py-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
              MD approved — payroll locked on this desk until MD de-approves the batch
            </span>
          </div>
        )}

        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-b border-slate-100 px-6 py-3">
          <button
            type="button"
            onClick={handlePrint}
            disabled={exportBlocked || exporting}
            title={exportBlocked ? gateMsg ?? '' : 'Print A4 report'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
              exportBlocked
                ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Printer className="h-3.5 w-3.5" />
            Print A4
          </button>
          <button
            type="button"
            onClick={() => void handlePdf()}
            disabled={exportBlocked || exporting}
            title={exportBlocked ? gateMsg ?? '' : 'Download A4 PDF'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider ${
              exportBlocked
                ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                : 'border border-blue-200 bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Generating…' : 'Download PDF'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {kind === 'payroll-cost' && <PayrollCostTable employees={employees} />}
          {kind === 'client-billing' && <ClientBillingTable rows={clientRows} />}
          {kind === 'statutory' && <StatutoryTable employees={employees} />}
          {kind === 'deductions' && <DeductionsTable employees={employees} />}
          {kind === 'stop-list' && (
            <FmRetentionListTable rows={[...FM_PREV_MONTH_STOP_LIST]} variant="stop" />
          )}
          {kind === 'half-hold' && (
            <FmRetentionListTable rows={[...FM_SALARY_MONTH_HALF_HOLD_LIST]} variant="half" />
          )}
        </div>

        <div className="flex flex-shrink-0 border-t border-slate-100 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function PayrollCostTable({ employees }: { employees: ReturnType<typeof flattenPortfolioEmployees> }) {
  return (
    <ReportTable
      columns={['Employee', 'Site', 'Gross Salary', 'Deductions', 'Net Take-Home']}
      rows={employees.map((e) => [
        <span key="n">
          <span className="font-bold text-slate-900">{e.name}</span>
          <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{e.empNumber}</span>
        </span>,
        e.siteName,
        lkr(e.totalGross),
        e.totalDeductions > 0 ? `− ${lkr(e.totalDeductions)}` : '—',
        lkr(e.netTakeHome),
      ])}
    />
  );
}

function ClientBillingTable({
  rows,
}: {
  rows: ReturnType<typeof buildClientBillingRows>;
}) {
  return (
    <ReportTable
      columns={[
        'Client / Site',
        'Invoice Amount',
        'Paid Date',
        'Paid Amount',
        'Client Deductions',
        'Payroll Cost',
        'Site Net P/L',
      ]}
      rows={rows.map((r) => [
        r.siteName,
        lkr(r.invoiceAmount),
        r.paidDate,
        lkr(r.paidAmount),
        lkr(r.clientDeductions),
        lkr(r.payrollCost),
        <span
          key="net"
          className={`font-mono text-xs font-black ${r.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
        >
          {lkr(r.netProfit)}
        </span>,
      ])}
    />
  );
}

function StatutoryTable({ employees }: { employees: ReturnType<typeof flattenPortfolioEmployees> }) {
  const apitReport = useMemo(() => buildStatutoryApitReport(employees), [employees]);
  const epfRows = employees.map((e) => {
    const s = calculateEmployeeStatutory(e.totalGross);
    return [
      <span key="n">
        <span className="font-bold text-slate-900">{e.name}</span>
        <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{e.empNumber}</span>
      </span>,
      e.siteName,
      lkr(s.epf),
      lkr(s.etf),
      lkr(s.stamp),
      lkr(s.epf + s.etf + s.stamp),
    ];
  });
  const epfTotals = employees.reduce(
    (acc, e) => {
      const s = calculateEmployeeStatutory(e.totalGross);
      acc.epf += s.epf;
      acc.etf += s.etf;
      acc.stamp += s.stamp;
      acc.total += s.total;
      return acc;
    },
    { epf: 0, etf: 0, stamp: 0, total: 0 },
  );
  const apitTotal = apitReport.bracketSummary.reduce((sum, row) => sum + row.totalApit, 0);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          EPF · ETF · Stamp Duty
        </h3>
        <ReportTable
          columns={['Employee', 'Site', 'EPF (8%)', 'ETF (3%)', 'Stamp', 'Subtotal']}
          rows={epfRows}
        />
        <p className="mt-3 text-right font-mono text-[11px] font-bold text-slate-600">
          Portfolio subtotal — EPF {lkr(epfTotals.epf)} · ETF {lkr(epfTotals.etf)} · Stamp{' '}
          {lkr(epfTotals.stamp)}
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          APIT — Bracket Summary
        </h3>
        <ReportTable
          columns={['Bracket', 'Rate', 'Employees', 'Total APIT']}
          rows={
            apitReport.bracketSummary.length > 0
              ? apitReport.bracketSummary.map((row) => [
                  row.label,
                  `${row.slab.rate}%`,
                  row.employeeCount.toLocaleString('en-LK'),
                  lkr(row.totalApit),
                ])
              : [['No APIT liability in any bracket this period.', '—', '—', '—']]
          }
        />
        {apitTotal > 0 && (
          <p className="mt-3 text-right font-mono text-[11px] font-bold text-violet-700">
            Portfolio APIT total — {lkr(apitTotal)}
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          APIT — Paying Employees by Bracket
        </h3>
        {apitReport.apitEmployees.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            No employees liable for APIT this period.
          </p>
        ) : (
          <div className="space-y-6">
            {apitReport.bracketSummary
              .filter((row) => (apitReport.employeesByBracket.get(row.slab.id)?.length ?? 0) > 0)
              .map((row) => {
                const rows = apitReport.employeesByBracket.get(row.slab.id) ?? [];
                return (
                  <div key={row.slab.id}>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
                      {row.label}
                    </p>
                    <ReportTable
                      columns={['Employee', 'Site', 'Gross Salary', 'APIT']}
                      rows={rows.map((entry) => [
                        <span key="n">
                          <span className="font-bold text-slate-900">{entry.employee.name}</span>
                          <span className="mt-0.5 block font-mono text-[11px] text-slate-400">
                            {entry.employee.empNumber}
                          </span>
                        </span>,
                        entry.employee.siteName,
                        lkr(entry.gross),
                        lkr(entry.apit),
                      ])}
                    />
                  </div>
                );
              })}
          </div>
        )}
      </section>

      <p className="border-t border-slate-200 pt-4 text-right font-mono text-[11px] font-black text-slate-800">
        Portfolio statutory total — {lkr(epfTotals.total)}
      </p>
    </div>
  );
}

function DeductionsTable({ employees }: { employees: ReturnType<typeof flattenPortfolioEmployees> }) {
  const totals = {
    meals: sumDeductionByType(employees, 'Meals'),
    uniform: sumDeductionByType(employees, 'Uniform'),
    advances: sumDeductionByType(employees, 'Advance'),
    penalties: sumDeductionByType(employees, 'Penalty'),
  };

  return (
    <>
      <ReportTable
        columns={['Employee', 'Site', 'Meals', 'Uniform', 'Advances', 'Penalties', 'Total']}
        rows={employees.map((e) => {
          const meals = e.deductions.filter((d) => d.type === 'Meals').reduce((s, d) => s + d.thisMonthAmount, 0);
          const uniform = e.deductions.filter((d) => d.type === 'Uniform').reduce((s, d) => s + d.thisMonthAmount, 0);
          const advances = e.deductions.filter((d) => d.type === 'Advance').reduce((s, d) => s + d.thisMonthAmount, 0);
          const penalties = e.deductions.filter((d) => d.type === 'Penalty').reduce((s, d) => s + d.thisMonthAmount, 0);
          return [
            <span key="n">
              <span className="font-bold text-slate-900">{e.name}</span>
              <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{e.empNumber}</span>
            </span>,
            e.siteName,
            meals ? lkr(meals) : '—',
            uniform ? lkr(uniform) : '—',
            advances ? lkr(advances) : '—',
            penalties ? lkr(penalties) : '—',
            e.totalDeductions > 0 ? lkr(e.totalDeductions) : '—',
          ];
        })}
      />
      <p className="mt-3 text-right font-mono text-[11px] font-bold text-slate-600">
        Portfolio totals — Meals {lkr(totals.meals)} · Uniform {lkr(totals.uniform)} · Advances{' '}
        {lkr(totals.advances)} · Penalties {lkr(totals.penalties)}
      </p>
    </>
  );
}

function ReportTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((col) => (
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
          {rows.map((cells, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3 text-xs ${j > 0 ? 'text-right font-mono font-semibold text-slate-800' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
