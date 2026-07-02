'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import ForgeCommerceShell from '../../components/ForgeCommerceShell';
import { FORGE_COMMERCE_THEME as C } from '../../components/forge-commerce-theme';
import {
  fetchForgeProductInvoices,
  markForgeProductInvoicePaid,
  sendForgeProductInvoice,
} from '../actions';
import { invoiceStatusLabel } from '../../../../lib/forge-commerce';
import { formatLkr } from '../../../../lib/saas-billing';

function statusClass(status: string): string {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'sent' || status === 'unpaid') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'void') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function ForgeCommerceInvoicesPage() {
  const [invoices, setInvoices] = useState<
    Awaited<ReturnType<typeof fetchForgeProductInvoices>>['invoices']
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchForgeProductInvoices();
    if (result.success) {
      setInvoices(result.invoices);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSend = (invoiceId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await sendForgeProductInvoice(invoiceId);
      if (!result.success) {
        setActionMessage(result.error ?? 'Send failed');
        return;
      }
      setActionMessage(
        result.emailed
          ? 'Invoice emailed to buyer.'
          : result.warning ?? 'Invoice updated (email not sent).',
      );
      await load();
    });
  };

  const handleMarkPaid = (invoiceId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await markForgeProductInvoicePaid(invoiceId);
      if (!result.success) {
        setActionMessage(result.error ?? 'Update failed');
        return;
      }
      setActionMessage('Marked paid.');
      await load();
    });
  };

  return (
    <ForgeCommerceShell title="Product Invoices" subtitle="Auto-send via Resend">
      <div className={`${C.hint} mb-6`}>
        Product purchase invoices only — not ERP platform billing (
        <strong>Platform → ERP Subscription Billing</strong>). Set{' '}
        <code className="rounded bg-amber-100 px-1 font-mono text-xs">RESEND_API_KEY</code> and{' '}
        <code className="rounded bg-amber-100 px-1 font-mono text-xs">FORGE_EMAIL_FROM</code> to email
        buyers.
      </div>

      {loadError ? <div className={`${C.error} mb-6`}>{loadError}</div> : null}
      {actionMessage ? <div className={`${C.success} mb-6`}>{actionMessage}</div> : null}

      <div className={`${C.tableWrap} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className={C.tableHead}>
              <tr>
                <th className="px-4 py-3 sm:px-6">Due</th>
                <th className="px-4 py-3 sm:px-6">Product</th>
                <th className="px-4 py-3 sm:px-6">Buyer</th>
                <th className="px-4 py-3 sm:px-6">Amount</th>
                <th className="px-4 py-3 sm:px-6">Status</th>
                <th className="px-4 py-3 sm:px-6">Inbox</th>
                <th className="px-4 py-3 text-right sm:px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="animate-pulse px-6 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    No product invoices yet. Record a purchase to create one.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className={C.tableRow}>
                    <td className="px-4 py-4 font-mono text-xs sm:px-6">{invoice.dueDate}</td>
                    <td className="px-4 py-4 font-semibold text-slate-900 sm:px-6">
                      {invoice.productName}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="text-slate-900">{invoice.buyerName}</p>
                      <p className="text-xs text-slate-500">{invoice.buyerEmail}</p>
                    </td>
                    <td className="px-4 py-4 font-semibold sm:px-6">
                      {formatLkr(invoice.amountLkr)}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass(invoice.status)}`}
                      >
                        {invoiceStatusLabel(invoice.status)}
                      </span>
                      {invoice.sentAt ? (
                        <p className="mt-1 text-[10px] text-slate-400">
                          Sent {new Date(invoice.sentAt).toLocaleDateString()}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      {invoice.contactThreadId ? (
                        <Link
                          href={`/forge/inbox?thread=${invoice.contactThreadId}`}
                          className="text-[10px] font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
                        >
                          View thread
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="space-x-3 px-4 py-4 text-right sm:px-6">
                      {invoice.status === 'draft' || invoice.status === 'unpaid' ? (
                        <button
                          type="button"
                          onClick={() => handleSend(invoice.id)}
                          disabled={isPending}
                          className="text-xs font-bold uppercase text-amber-700 hover:text-amber-900"
                        >
                          Send
                        </button>
                      ) : null}
                      {invoice.status !== 'paid' && invoice.status !== 'void' ? (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(invoice.id)}
                          disabled={isPending}
                          className="text-xs font-bold uppercase text-emerald-700 hover:text-emerald-900"
                        >
                          Mark paid
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ForgeCommerceShell>
  );
}
