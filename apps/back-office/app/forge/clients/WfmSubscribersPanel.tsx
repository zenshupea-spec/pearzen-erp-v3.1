'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  SUBSCRIPTION_STATUS_LABELS,
} from '../../../lib/company-subscription';
import { formatLkr } from '../../../lib/saas-billing';
import { tenantProductionDomain } from '../../../lib/tenant-host';
import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import { fetchWfmSubscribers, type WfmSubscriberRow } from './actions';

const COMMERCE_ONLY_LABEL = 'Commerce only';

function statusLabel(status: WfmSubscriberRow['subscriptionStatus']): string {
  if (status === 'commerce_only') return COMMERCE_ONLY_LABEL;
  return SUBSCRIPTION_STATUS_LABELS[status];
}

function statusBadgeClass(status: WfmSubscriberRow['subscriptionStatus']): string {
  switch (status) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'trial':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'past_due':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'suspended':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'commerce_only':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function formatActiveSince(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type WfmSubscribersPanelProps = {
  selectedId: string | null;
  onSelect: (row: WfmSubscriberRow | null) => void;
};

export default function WfmSubscribersPanel({ selectedId, onSelect }: WfmSubscribersPanelProps) {
  const [subscribers, setSubscribers] = useState<WfmSubscriberRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const result = await fetchWfmSubscribers();
      if (cancelled) return;

      if (result.success) {
        setLoadError(null);
        setSubscribers(result.subscribers);
      } else {
        setLoadError(result.error ?? 'Failed to load subscribers');
        setSubscribers([]);
      }
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return subscribers;
    return subscribers.filter((row) => {
      const haystack = [row.name, row.slug, row.buyerEmail, row.purchaseStatus]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, subscribers]);

  return (
    <div className={`${T.card} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900">WFM Tool subscribers</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Tenants on WFM bundle or standalone WFM commerce purchases.
          </p>
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search subscribers</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, slug, email…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pl-9 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </label>
      </div>

      {loadError ? (
        <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className={T.tableHead}>
            <tr>
              <th className="px-4 py-3 sm:px-6">Subscriber</th>
              <th className="px-4 py-3 sm:px-6">Slug / domain</th>
              <th className="px-4 py-3 sm:px-6">Status</th>
              <th className="px-4 py-3 sm:px-6">Active since</th>
              <th className="px-4 py-3 text-right sm:px-6">Monthly</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="animate-pulse px-6 py-12 text-center text-slate-400">
                  Loading WFM subscribers…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  {query ? 'No subscribers match your search.' : 'No WFM subscribers yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const isSelected = selectedId === row.id;
                const domain = row.slug ? tenantProductionDomain(row.slug) : null;

                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelect(isSelected ? null : row)}
                    className={`cursor-pointer ${isSelected ? T.tableRowActive : T.tableRow}`}
                  >
                    <td className="px-4 py-4 sm:px-6">
                      <p className="font-semibold text-slate-900">{row.name}</p>
                      {row.buyerEmail ? (
                        <p className="mt-0.5 text-xs text-slate-500">{row.buyerEmail}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-500 sm:px-6">
                      {row.slug ? (
                        <span title={domain ?? undefined}>{row.slug}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass(row.subscriptionStatus)}`}
                      >
                        {statusLabel(row.subscriptionStatus)}
                      </span>
                      {row.purchaseStatus ? (
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">
                          Purchase: {row.purchaseStatus}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-slate-600 sm:px-6">
                      {formatActiveSince(row.activeSince)}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-800 sm:px-6">
                      {formatLkr(row.monthlyTotalLkr)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { WfmSubscriberRow };
