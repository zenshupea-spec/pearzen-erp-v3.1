'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { invoiceStatusLabel } from '../../../lib/forge-commerce';
import { formatLkr } from '../../../lib/saas-billing';
import { markForgeProductInvoicePaid } from '../commerce/actions';
import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import {
  fetchWebsiteClientDetail,
  syncWebsiteClientPearsListing,
  type WebsiteClientDetail,
  type WebsitePartnerClientRow,
  type WebsitePartnerRow,
} from './actions';

function pearsStatusClass(status: WebsiteClientDetail['pears']['status']): string {
  switch (status) {
    case 'listed':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'pending':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function pearsStatusLabel(status: WebsiteClientDetail['pears']['status']): string {
  switch (status) {
    case 'listed':
      return 'Listed on PEARS';
    case 'pending':
      return 'PEARS pending';
    default:
      return 'Not on PEARS';
  }
}

function invoiceStatusClass(status: string): string {
  if (status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'sent' || status === 'unpaid') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

type WebsiteClientDetailPanelProps = {
  partner: WebsitePartnerRow;
  client: WebsitePartnerClientRow;
  onClose: () => void;
  onUpdated?: () => void;
};

export default function WebsiteClientDetailPanel({
  partner,
  client,
  onClose,
  onUpdated,
}: WebsiteClientDetailPanelProps) {
  const [detail, setDetail] = useState<WebsiteClientDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchWebsiteClientDetail({
      partnerId: partner.id,
      companyId: client.companyId,
      portfolioId: client.portfolioId,
    });

    if (result.success && result.detail) {
      setLoadError(null);
      setDetail(result.detail);
    } else {
      setLoadError(result.error ?? 'Failed to load client detail');
      setDetail(null);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void load();
  }, [partner.id, client.companyId, client.portfolioId]);

  const primarySite = useMemo(() => {
    if (!detail) return null;
    return (
      detail.sites.find((row) => row.isPublished && row.siteUrl) ??
      detail.sites.find((row) => row.siteUrl) ??
      null
    );
  }, [detail]);

  const handleMarkPaid = (invoiceId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await markForgeProductInvoicePaid(invoiceId);
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to mark paid');
        return;
      }
      setActionMessage('Invoice marked paid — manager share recorded when applicable.');
      await load();
      onUpdated?.();
    });
  };

  const handleSyncPears = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await syncWebsiteClientPearsListing({ companyId: client.companyId });
      if (!result.success) {
        setActionMessage(result.error ?? 'PEARS sync failed');
        return;
      }
      setActionMessage('PEARS store snapshot exported — shop listing updated.');
      await load();
      onUpdated?.();
    });
  };

  return (
    <div className={`${T.card} overflow-hidden`}>
      <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50/80 to-violet-50/50 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
              Website client
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{client.companyName}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Manager {partner.displayName}
              {client.companySlug ? ` · ${client.companySlug}` : ''}
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
        <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}

      {actionMessage ? (
        <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-3 text-sm text-emerald-700">
          {actionMessage}
        </div>
      ) : null}

      {isLoading ? (
        <p className="animate-pulse px-6 py-16 text-center text-sm text-slate-400">Loading client…</p>
      ) : detail ? (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
          <section className="p-4 sm:p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Live website
            </h3>

            {primarySite?.siteUrl ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <p className="text-sm font-semibold text-slate-900">{primarySite.label}</p>
                {primarySite.hostname ? (
                  <p className="mt-1 font-mono text-xs text-slate-600">{primarySite.hostname}</p>
                ) : null}
                <a
                  href={primarySite.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-50"
                >
                  Open website
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                {primarySite.publishedAt ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Published {new Date(primarySite.publishedAt).toLocaleDateString('en-LK')}
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-amber-700">Draft — not published yet</p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No public site URL configured yet.</p>
            )}

            {detail.sites.length > 1 ? (
              <ul className="mt-4 space-y-2">
                {detail.sites.map((site) => (
                  <li
                    key={`${site.siteType}-${site.hostname ?? 'default'}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    <span className="font-semibold text-slate-800">{site.label}</span>
                    {site.isPublished ? ' · Live' : ' · Draft'}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-800">PEARS marketplace</h4>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${pearsStatusClass(detail.pears.status)}`}
                >
                  {pearsStatusLabel(detail.pears.status)}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Future home: <span className="font-mono">pear.pearzen.tech</span>. Website clients are
                auto-listed when their site is published; use sync if a snapshot is missing.
              </p>
              {detail.pears.lastSnapshotAt ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Last snapshot {new Date(detail.pears.lastSnapshotAt).toLocaleDateString('en-LK')}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {detail.pears.status !== 'listed' && primarySite?.isPublished ? (
                  <button
                    type="button"
                    onClick={handleSyncPears}
                    disabled={isPending}
                    className="text-[10px] font-bold uppercase tracking-wider text-violet-700 hover:text-violet-900 disabled:opacity-50"
                  >
                    Sync PEARS listing
                  </button>
                ) : null}
                <Link
                  href="/login/pears"
                  className="text-[10px] font-bold uppercase tracking-wider text-violet-700 hover:text-violet-900"
                >
                  Client PEARS login →
                </Link>
                <Link
                  href="/forge/superapp/exports"
                  className="text-[10px] font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
                >
                  Export jobs →
                </Link>
              </div>
            </div>

            <Link
              href={`/forge/tenants/${client.companyId}/websites`}
              className="mt-4 inline-block text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800"
            >
              Forge website audit →
            </Link>
          </section>

          <section className="p-4 sm:p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Billings
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Month 1 LKR 10,000 · then LKR 5,000/mo with manager share on paid invoices.
            </p>

            {detail.invoices.length === 0 ? (
              <p className="mt-6 text-sm text-slate-400">No website invoices yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {detail.invoices.map((invoice) => {
                  const canMarkPaid =
                    invoice.status !== 'paid' &&
                    invoice.status !== 'void' &&
                    invoice.status !== 'draft';

                  return (
                    <li
                      key={invoice.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-[11px] text-slate-500">Due {invoice.dueDate}</p>
                          <p className="mt-1 text-sm font-bold text-slate-900">
                            {formatLkr(invoice.amountLkr)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${invoiceStatusClass(invoice.status)}`}
                        >
                          {invoiceStatusLabel(
                            invoice.status as 'draft' | 'sent' | 'unpaid' | 'paid' | 'void',
                          )}
                        </span>
                      </div>
                      {invoice.partnerShareLkr != null && invoice.pearzenShareLkr != null ? (
                        <p className="mt-2 text-[11px] text-slate-500">
                          Split: {formatLkr(invoice.pearzenShareLkr)} Pearzen ·{' '}
                          {formatLkr(invoice.partnerShareLkr)} manager
                        </p>
                      ) : null}
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

            <Link
              href="/forge/commerce/invoices"
              className="mt-4 inline-block text-[10px] font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
            >
              All commerce invoices →
            </Link>
          </section>
        </div>
      ) : null}
    </div>
  );
}
