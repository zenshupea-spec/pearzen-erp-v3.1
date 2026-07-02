'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import { payoutSourceTypeLabel } from '../../../lib/forge-partners';
import { formatLkr } from '../../../lib/saas-billing';
import {
  exportPartnerPayoutLedgerCsv,
  fetchPartnerPayoutLedger,
  type PartnerPayoutLedgerRow,
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

export default function PartnersPayoutsPage() {
  const [rows, setRows] = useState<PartnerPayoutLedgerRow[]>([]);
  const [partnerTotalLkr, setPartnerTotalLkr] = useState(0);
  const [pearzenTotalLkr, setPearzenTotalLkr] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchPartnerPayoutLedger();
    if (result.success) {
      setRows(result.rows);
      setPartnerTotalLkr(result.partnerTotalLkr);
      setPearzenTotalLkr(result.pearzenTotalLkr);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load payouts');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleExport = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await exportPartnerPayoutLedgerCsv();
      if (!result.success) {
        setActionMessage(result.error ?? 'Export failed');
        return;
      }
      downloadCsv(result.csv, result.filename);
      setActionMessage('CSV exported.');
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-tight">Payout ledger</h2>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Revenue-share entries are recorded automatically when referred-tenant ERP or commerce
            invoices are marked paid in the SaaS Forge.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isPending || rows.length === 0}
          className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {loadError}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-[#111118] p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Your share (total)
          </p>
          <p className="mt-2 text-2xl font-black text-cyan-300">{formatLkr(partnerTotalLkr)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#111118] p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Pearzen share (reference)
          </p>
          <p className="mt-2 text-2xl font-black text-slate-300">{formatLkr(pearzenTotalLkr)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#111118] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-bold">Billing month</th>
                <th className="px-4 py-3 font-bold">Tenant</th>
                <th className="px-4 py-3 font-bold">Source</th>
                <th className="px-4 py-3 font-bold text-right">Your share</th>
                <th className="px-4 py-3 font-bold text-right">Pearzen share</th>
                <th className="px-4 py-3 font-bold">Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading ledger…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No payout entries yet. Link tenants in{' '}
                    <Link href="/partners/portfolio" className="text-cyan-400 hover:text-white">
                      Portfolio
                    </Link>{' '}
                    and mark their invoices paid in Forge.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {formatBillingMonth(row.billingMonth)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{row.companyName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {payoutSourceTypeLabel(row.sourceType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-cyan-300">
                      {formatLkr(row.partnerShareLkr)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {formatLkr(row.pearzenShareLkr)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatRecordedAt(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Month 1 on each portfolio: LKR 5,000 partner / 5,000 Pearzen. Month 2+: LKR 1,000 partner /
        3,000 Pearzen per paid invoice event.
      </p>
    </div>
  );
}
