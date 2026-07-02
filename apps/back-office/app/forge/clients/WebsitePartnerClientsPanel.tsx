'use client';

import { useEffect, useMemo, useState } from 'react';

import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import {
  fetchWebsitePartnerClients,
  type WebsitePartnerClientRow,
  type WebsitePartnerRow,
} from './actions';

function siteStatusBadge(siteLive: boolean): string {
  return siteLive
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
}

function siteStatusLabel(siteLive: boolean): string {
  return siteLive ? 'Live' : 'Not live';
}

function monthlyStatusBadge(status: WebsitePartnerClientRow['monthlyStatus']): string {
  switch (status) {
    case 'current':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'past_due':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'setup':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'churned':
      return 'border-slate-200 bg-slate-100 text-slate-500';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function monthlyStatusLabel(status: WebsitePartnerClientRow['monthlyStatus']): string {
  switch (status) {
    case 'current':
      return 'Current';
    case 'past_due':
      return 'Past due';
    case 'setup':
      return 'Setup';
    case 'churned':
      return 'Churned';
    default:
      return 'Unknown';
  }
}

type WebsitePartnerClientsPanelProps = {
  partner: WebsitePartnerRow;
  selectedId: string | null;
  onSelect: (row: WebsitePartnerClientRow | null) => void;
  onClose: () => void;
};

export default function WebsitePartnerClientsPanel({
  partner,
  selectedId,
  onSelect,
  onClose,
}: WebsitePartnerClientsPanelProps) {
  const [clients, setClients] = useState<WebsitePartnerClientRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const result = await fetchWebsitePartnerClients(partner.id);
      if (cancelled) return;

      if (result.success) {
        setLoadError(null);
        setClients(result.clients);
      } else {
        setLoadError(result.error ?? 'Failed to load clients');
        setClients([]);
      }
      setIsLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((row) => {
      const haystack = [row.companyName, row.companySlug, row.siteHostname]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [clients, query]);

  return (
    <div className={`${T.card} flex h-fit flex-col overflow-hidden xl:sticky xl:top-28`}>
      <div className="border-b border-slate-200 bg-emerald-50/60 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
              Website clients
            </p>
            <h2 className="mt-1 truncate text-base font-bold text-slate-900">
              {partner.displayName}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {partner.websiteClientCount} website client
              {partner.websiteClientCount === 1 ? '' : 's'} · referral {partner.referralCode}
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

      <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <label className="relative block">
          <span className="sr-only">Search clients</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search client or hostname…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pl-9 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
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
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700 sm:px-5">
          {loadError}
        </div>
      ) : null}

      <div className="max-h-[28rem] overflow-y-auto">
        {isLoading ? (
          <p className="animate-pulse px-6 py-12 text-center text-sm text-slate-400">
            Loading clients…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-400">
            {query ? 'No clients match your search.' : 'No website clients for this manager yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((row) => {
              const isSelected = selectedId === row.id;

              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(isSelected ? null : row)}
                    className={`w-full px-4 py-4 text-left transition-colors sm:px-5 ${
                      isSelected ? 'bg-violet-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{row.companyName}</p>
                        {row.companySlug ? (
                          <p className="mt-0.5 font-mono text-xs text-slate-500">{row.companySlug}</p>
                        ) : null}
                        {row.siteHostname ? (
                          <p className="mt-1 truncate text-[11px] text-emerald-700">
                            {row.siteHostname}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${siteStatusBadge(row.siteLive)}`}
                        >
                          {siteStatusLabel(row.siteLive)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${monthlyStatusBadge(row.monthlyStatus)}`}
                        >
                          {monthlyStatusLabel(row.monthlyStatus)}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export type { WebsitePartnerClientRow };
