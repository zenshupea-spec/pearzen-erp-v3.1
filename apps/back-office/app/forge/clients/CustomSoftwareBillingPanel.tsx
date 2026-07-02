'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import {
  invoiceStatusLabel,
  milestoneStatusLabel,
  type ForgeProjectMilestoneStatus,
} from '../../../lib/forge-commerce';
import { formatLkr } from '../../../lib/saas-billing';
import {
  invoiceForgeProjectMilestone,
  markForgeProductInvoicePaid,
} from '../commerce/actions';
import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import {
  fetchCustomSoftwareClientBillings,
  type CustomSoftwareBillingInvoice,
  type CustomSoftwareBillingMilestone,
  type CustomSoftwareClientRow,
} from './actions';

function milestoneStatusClass(status: string): string {
  switch (status) {
    case 'paid':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'invoiced':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'skipped':
      return 'border-slate-200 bg-slate-100 text-slate-500';
    case 'pending':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700';
  }
}

function invoiceStatusClass(status: string): string {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'sent' || status === 'unpaid') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'void') return 'border-slate-200 bg-slate-100 text-slate-500';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

type CustomSoftwareBillingPanelProps = {
  client: CustomSoftwareClientRow;
  onClose: () => void;
  onUpdated?: () => void;
};

export default function CustomSoftwareBillingPanel({
  client,
  onClose,
  onUpdated,
}: CustomSoftwareBillingPanelProps) {
  const [milestones, setMilestones] = useState<CustomSoftwareBillingMilestone[]>([]);
  const [invoices, setInvoices] = useState<CustomSoftwareBillingInvoice[]>([]);
  const [scheduledTotalLkr, setScheduledTotalLkr] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchCustomSoftwareClientBillings(client.purchaseId);

    if (result.success) {
      setLoadError(null);
      setMilestones(result.milestones);
      setInvoices(result.invoices);
      setScheduledTotalLkr(result.scheduledTotalLkr);
    } else {
      setLoadError(result.error ?? 'Failed to load billings');
      setMilestones([]);
      setInvoices([]);
      setScheduledTotalLkr(0);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void load();
  }, [client.purchaseId]);

  const notifyUpdated = async () => {
    await load();
    onUpdated?.();
  };

  const handleInvoiceMilestone = (milestoneId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await invoiceForgeProjectMilestone(milestoneId, true);
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to invoice milestone');
        return;
      }
      setActionMessage(
        result.emailWarning
          ? `Milestone invoiced · ${result.emailWarning}`
          : 'Milestone invoiced.',
      );
      await notifyUpdated();
    });
  };

  const handleMarkPaid = (invoiceId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await markForgeProductInvoicePaid(invoiceId);
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to mark paid');
        return;
      }
      setActionMessage('Invoice marked paid.');
      await notifyUpdated();
    });
  };

  return (
    <aside className={`${T.card} flex h-fit flex-col overflow-hidden xl:sticky xl:top-28`}>
      <div className="border-b border-slate-200 bg-indigo-50/60 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700">
              Milestones & billings
            </p>
            <h2 className="mt-1 line-clamp-2 text-base font-bold text-slate-900">
              {client.projectName}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Contract {client.priceLkr > 0 ? formatLkr(client.priceLkr) : '—'}
              {scheduledTotalLkr > 0 ? ` · scheduled ${formatLkr(scheduledTotalLkr)}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
          >
            Close
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700 sm:px-5">
          {loadError}
        </div>
      ) : null}

      {actionMessage ? (
        <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 sm:px-5">
          {actionMessage}
        </div>
      ) : null}

      <div className="max-h-[32rem] overflow-y-auto px-4 py-4 sm:px-5">
        {isLoading ? (
          <p className="animate-pulse py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Milestone timeline
              </h3>
              {milestones.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No milestones scheduled yet.</p>
              ) : (
                <ol className="relative mt-4 space-y-0 border-l border-indigo-100 pl-4">
                  {milestones.map((milestone, index) => (
                    <li key={milestone.id} className="relative pb-5 last:pb-0">
                      <span
                        className={`absolute -left-[1.3rem] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white ${
                          milestone.status === 'paid'
                            ? 'bg-emerald-500'
                            : milestone.status === 'invoiced'
                              ? 'bg-sky-500'
                              : milestone.status === 'skipped'
                                ? 'bg-slate-300'
                                : 'bg-amber-400'
                        }`}
                        aria-hidden
                      />
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900">
                              {index + 1}. {milestone.title}
                            </p>
                            {milestone.description ? (
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {milestone.description}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-slate-500">
                              {formatLkr(milestone.amountLkr)}
                              {milestone.dueDate ? ` · due ${milestone.dueDate}` : ''}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${milestoneStatusClass(milestone.status)}`}
                          >
                            {milestoneStatusLabel(
                              milestone.status as ForgeProjectMilestoneStatus,
                            )}
                          </span>
                        </div>
                        {milestone.status === 'pending' ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleInvoiceMilestone(milestone.id)}
                            className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                          >
                            Create invoice
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Invoices
              </h3>
              {invoices.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No invoices yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {invoices.map((invoice) => {
                    const canMarkPaid =
                      invoice.status !== 'paid' &&
                      invoice.status !== 'void' &&
                      invoice.status !== 'draft';

                    return (
                      <li
                        key={invoice.id}
                        className="rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-[11px] text-slate-500">
                              Due {invoice.dueDate}
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-900">
                              {formatLkr(invoice.amountLkr)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${invoiceStatusClass(invoice.status)}`}
                          >
                            {invoiceStatusLabel(
                              invoice.status as
                                | 'draft'
                                | 'sent'
                                | 'unpaid'
                                | 'paid'
                                | 'void',
                            )}
                          </span>
                        </div>
                        {canMarkPaid ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleMarkPaid(invoice.id)}
                            className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Mark paid
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2">
          <Link
            href="/forge/commerce/invoices"
            className="text-center text-[10px] font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
          >
            All commerce invoices →
          </Link>
          <Link
            href="/forge/commerce/purchases"
            className="text-center text-[10px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800"
          >
            Manage purchases →
          </Link>
        </div>
      </div>
    </aside>
  );
}
