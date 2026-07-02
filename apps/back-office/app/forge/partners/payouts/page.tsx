'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import { payoutSourceTypeLabel } from '../../../../lib/forge-partners';
import { formatLkr } from '../../../../lib/saas-billing';
import { FORGE_PORTAL_THEME as T } from '../../components/forge-portal-theme';
import {
  exportForgePayoutAuditCsv,
  fetchForgePayoutAuditLedger,
  type ForgePayoutAuditRow,
} from './actions';

function formatBillingMonth(value: string): string {
  if (!value) return '—';
  return value.slice(0, 7);
}

function formatRecordedAt(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' });
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ForgePartnerPayoutsAuditPage() {
  const [rows, setRows] = useState<ForgePayoutAuditRow[]>([]);
  const [partnerTotalLkr, setPartnerTotalLkr] = useState(0);
  const [pearzenTotalLkr, setPearzenTotalLkr] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchForgePayoutAuditLedger();
    if (result.success) {
      setRows(result.rows);
      setPartnerTotalLkr(result.partnerTotalLkr);
      setPearzenTotalLkr(result.pearzenTotalLkr);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load payout audit');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleExport = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await exportForgePayoutAuditCsv();
      if (!result.success) {
        setActionMessage(result.error ?? 'Export failed');
        return;
      }
      downloadCsv(result.csv, result.filename);
      setActionMessage('Audit CSV exported.');
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/forge/partners"
            className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-violet-700"
          >
            ← Partner hub
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Partner payout audit</h1>
          <p className={`mt-1 max-w-2xl ${T.sectionDesc}`}>
            Cross-partner revenue-share ledger written when ERP subscription or commerce invoices are
            marked paid. Entries are idempotent per invoice.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isPending || rows.length === 0}
          className="inline-flex shrink-0 items-center rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-800 hover:bg-cyan-100 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={`${T.card} p-5`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Partner shares (shown)
          </p>
          <p className="mt-2 text-2xl font-bold text-cyan-700">{formatLkr(partnerTotalLkr)}</p>
        </div>
        <div className={`${T.card} p-5`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Pearzen shares (shown)
          </p>
          <p className="mt-2 text-2xl font-bold text-violet-700">{formatLkr(pearzenTotalLkr)}</p>
        </div>
      </div>

      <div className={`${T.tableWrap} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className={T.tableHead}>
              <tr>
                <th className="px-4 py-3 sm:px-6">Partner</th>
                <th className="px-4 py-3 sm:px-6">Tenant</th>
                <th className="px-4 py-3 sm:px-6">Month</th>
                <th className="px-4 py-3 sm:px-6">Source</th>
                <th className="px-4 py-3 text-right sm:px-6">Partner</th>
                <th className="px-4 py-3 text-right sm:px-6">Pearzen</th>
                <th className="px-4 py-3 sm:px-6">Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    Loading audit ledger…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    No payout entries yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={T.tableRow}>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="font-semibold text-slate-900">{row.partnerName}</p>
                      <p className="text-xs text-slate-500">{row.partnerEmail}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-700 sm:px-6">{row.companyName ?? '—'}</td>
                    <td className="px-4 py-4 font-mono text-slate-600 sm:px-6">
                      {formatBillingMonth(row.billingMonth)}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {payoutSourceTypeLabel(row.sourceType)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-cyan-700 sm:px-6">
                      {formatLkr(row.partnerShareLkr)}
                    </td>
                    <td className="px-4 py-4 text-right text-violet-700 sm:px-6">
                      {formatLkr(row.pearzenShareLkr)}
                    </td>
                    <td className="px-4 py-4 text-slate-500 sm:px-6">
                      {formatRecordedAt(row.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
