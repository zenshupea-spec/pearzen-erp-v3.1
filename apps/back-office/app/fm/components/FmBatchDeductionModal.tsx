'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import {
  buildDeductionTableHtml,
  deductionLedgerTotal,
  deductionReportMeta,
  FM_BATCH_PERIOD,
  getDeductionLedger,
  type BatchDeductionKind,
  type BatchDeductionRow,
} from '../lib/batch-deductions-ledger';
import { downloadFmA4Pdf, openFmA4Report } from '../lib/fm-report-print';

function lkr(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const accentStyles = {
  indigo: {
    icon: 'border-indigo-200 bg-indigo-50 text-indigo-600',
    btn: 'border-indigo-200 bg-indigo-600 hover:bg-indigo-500',
    footBg: 'bg-indigo-50/60',
    footLabel: 'text-indigo-800',
    footAmount: 'text-indigo-900',
    amount: 'text-indigo-700',
    categoryDisciplinary: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  },
  violet: {
    icon: 'border-violet-200 bg-violet-50 text-violet-600',
    btn: 'border-violet-200 bg-violet-600 hover:bg-violet-500',
    footBg: 'bg-violet-50/60',
    footLabel: 'text-violet-800',
    footAmount: 'text-violet-900',
    amount: 'text-violet-700',
    categoryDisciplinary: 'bg-violet-50 text-violet-800 ring-violet-200',
  },
  amber: {
    icon: 'border-amber-200 bg-amber-50 text-amber-600',
    btn: 'border-amber-200 bg-amber-600 hover:bg-amber-500',
    footBg: 'bg-amber-50/60',
    footLabel: 'text-amber-800',
    footAmount: 'text-amber-900',
    amount: 'text-amber-700',
    categoryDisciplinary: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  rose: {
    icon: 'border-rose-200 bg-rose-50 text-rose-600',
    btn: 'border-rose-200 bg-rose-600 hover:bg-rose-500',
    footBg: 'bg-rose-50/60',
    footLabel: 'text-rose-800',
    footAmount: 'text-rose-900',
    amount: 'text-rose-700',
    categoryDisciplinary: 'bg-rose-50 text-rose-800 ring-rose-200',
  },
};

type FmBatchDeductionModalProps = {
  kind: BatchDeductionKind;
  onClose: () => void;
  rows?: BatchDeductionRow[];
  periodLabel?: string;
};

export default function FmBatchDeductionModal({
  kind,
  onClose,
  rows,
  periodLabel = FM_BATCH_PERIOD,
}: FmBatchDeductionModalProps) {
  const [exporting, setExporting] = useState(false);
  const ledger = rows ?? getDeductionLedger(kind);
  const meta = deductionReportMeta(kind);
  const styles = accentStyles[meta.accent];

  const total = useMemo(() => deductionLedgerTotal(ledger), [ledger]);
  const printTables = useMemo(() => buildDeductionTableHtml(kind, ledger), [kind, ledger]);
  const amountHeader = meta.amountColumn.replace(/\s*\(LKR\)\s*$/i, '');
  const footerTotalLabel = kind === 'advance' ? 'Total outstanding' : 'Batch total';
  const tableColumns = [
    'Employee',
    'Site',
    meta.detailColumn,
    ...(meta.showSupplierColumn ? (['Supplier'] as const) : []),
    amountHeader,
  ];
  const footerColSpan = tableColumns.length - 1;

  const reportOpts = {
    title: meta.title,
    subtitle: meta.subtitle,
    period: periodLabel,
    tableHeadHtml: printTables.head,
    tableBodyHtml: printTables.body,
    footerNote: `${ledger.length} employees · ${footerTotalLabel.toLowerCase()} ${lkr(total)}`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${styles.icon}`}>
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">{meta.title.replace(' Report', '')}</p>
              <p className="text-[11px] text-slate-500">
                {periodLabel} · {ledger.length} employees · {lkr(total)}
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

        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-b border-slate-100 px-6 py-3">
          <button
            type="button"
            onClick={() => openFmA4Report(reportOpts)}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print A4
          </button>
          <button
            type="button"
            onClick={() => {
              setExporting(true);
              void downloadFmA4Pdf({
                filename: `fm-${meta.filenameSlug}-${periodLabel.replace(/\s+/g, '-')}.pdf`,
                ...reportOpts,
              }).finally(() => setExporting(false));
            }}
            disabled={exporting}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white ${styles.btn}`}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Generating…' : 'Download PDF'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {tableColumns.map((col) => (
                    <th
                      key={col}
                      className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 ${
                        col === amountHeader ? 'text-right' : ''
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((r) => (
                  <tr key={r.empNo} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="text-[12px] font-bold text-slate-900">{r.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">
                        {r.empNo} · {r.rank}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-semibold text-slate-700">{r.site}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                          kind === 'penalty' && r.detail === 'Client pass-through'
                            ? 'bg-amber-50 text-amber-800 ring-amber-200'
                            : styles.categoryDisciplinary
                        }`}
                      >
                        {r.detail}
                      </span>
                    </td>
                    {meta.showSupplierColumn && (
                      <td className="max-w-[200px] px-4 py-3 text-[12px] font-semibold text-slate-700">
                        {r.supplier}
                      </td>
                    )}
                    <td className={`px-4 py-3 text-right font-mono text-[12px] font-black tabular-nums ${styles.amount}`}>
                      {lkr(r.amountLkr)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`border-t border-slate-200 ${styles.footBg}`}>
                  <td
                    colSpan={footerColSpan}
                    className={`px-4 py-3 text-right text-[11px] font-black uppercase tracking-widest ${styles.footLabel}`}
                  >
                    {footerTotalLabel}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-black tabular-nums ${styles.footAmount}`}>
                    {lkr(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
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
