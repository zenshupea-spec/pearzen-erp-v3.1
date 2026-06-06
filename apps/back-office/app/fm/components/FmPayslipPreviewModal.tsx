'use client';

import { Download, Printer, X } from 'lucide-react';
import type { FmPayrollRosterRow } from '../lib/fm-payroll-roster-data';
import {
  downloadPayslipPdf,
  openPayslipPrint,
  payslipPreviewSections,
} from '../lib/fm-payslip-document';

export default function FmPayslipPreviewModal({
  row,
  periodLabel,
  onClose,
}: {
  row: FmPayrollRosterRow;
  periodLabel: string;
  onClose: () => void;
}) {
  const sections = payslipPreviewSections(row, periodLabel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-sm font-black text-slate-900">Payslip Preview</p>
            <p className="text-[11px] text-slate-500">
              {row.name} · {row.empNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Classic Venture Security
            </p>
            <p className="mt-1 text-lg font-black text-slate-900">{row.name}</p>
            <p className="font-mono text-xs text-slate-500">{row.payslipId}</p>
          </div>
          <dl className="mt-4 space-y-2">
            {sections.map((item) => (
              <div
                key={item.label}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                  item.success
                    ? 'bg-emerald-50 ring-1 ring-emerald-100'
                    : item.danger
                      ? 'bg-red-50/80 ring-1 ring-red-100'
                      : 'bg-white'
                }`}
              >
                <dt className="text-xs font-semibold text-slate-600">{item.label}</dt>
                <dd
                  className={`text-right text-xs font-bold ${
                    item.mono ? 'font-mono' : ''
                  } ${
                    item.success
                      ? 'text-emerald-800'
                      : item.danger
                        ? 'text-red-700'
                        : 'text-slate-900'
                  }`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={() => openPayslipPrint(row, periodLabel)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <button
            type="button"
            onClick={() => void downloadPayslipPdf(row, periodLabel)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-blue-600/20 hover:bg-blue-500"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}
