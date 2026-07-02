'use client';

import { useEffect, useMemo, useState } from 'react';

import { purchaseStatusLabel } from '../../../lib/forge-commerce';
import { formatLkr } from '../../../lib/saas-billing';
import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import { fetchCustomSoftwareClients, type CustomSoftwareClientRow } from './actions';

function purchaseStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'completed':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'cancelled':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'pending':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700';
  }
}

function formatStartedAt(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function progressBarClass(pct: number): string {
  if (pct >= 100) return 'bg-indigo-500';
  if (pct >= 50) return 'bg-violet-500';
  return 'bg-indigo-300';
}

type CustomSoftwareClientsPanelProps = {
  selectedId: string | null;
  onSelect: (row: CustomSoftwareClientRow | null) => void;
  reloadNonce?: number;
};

export default function CustomSoftwareClientsPanel({
  selectedId,
  onSelect,
  reloadNonce = 0,
}: CustomSoftwareClientsPanelProps) {
  const [clients, setClients] = useState<CustomSoftwareClientRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const result = await fetchCustomSoftwareClients();
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
  }, [reloadNonce]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((row) => {
      const haystack = [
        row.projectName,
        row.buyerName,
        row.buyerEmail,
        row.companyName,
        row.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [clients, query]);

  return (
    <div className={`${T.card} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Custom software clients</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Enterprise builds with milestone billing from Forge commerce.
          </p>
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search clients</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search project, buyer, company…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pl-9 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
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
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className={T.tableHead}>
            <tr>
              <th className="px-4 py-3 sm:px-6">Project</th>
              <th className="px-4 py-3 sm:px-6">Buyer</th>
              <th className="px-4 py-3 sm:px-6">Status</th>
              <th className="px-4 py-3 sm:px-6">Milestones</th>
              <th className="px-4 py-3 sm:px-6">Started</th>
              <th className="px-4 py-3 text-right sm:px-6">Contract</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="animate-pulse px-6 py-12 text-center text-slate-400">
                  Loading custom software clients…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  {query ? 'No clients match your search.' : 'No custom software clients yet.'}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const isSelected = selectedId === row.id;

                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelect(isSelected ? null : row)}
                    className={`cursor-pointer ${isSelected ? T.tableRowActive : T.tableRow}`}
                  >
                    <td className="px-4 py-4 sm:px-6">
                      <p className="font-semibold text-slate-900">{row.projectName}</p>
                      {row.companyName ? (
                        <p className="mt-0.5 text-xs text-slate-500">{row.companyName}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="font-medium text-slate-800">{row.buyerName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.buyerEmail}</p>
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${purchaseStatusBadgeClass(row.status)}`}
                      >
                        {purchaseStatusLabel(row.status as 'pending' | 'active' | 'cancelled' | 'completed')}
                      </span>
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      {row.milestoneTotal > 0 ? (
                        <div className="min-w-[120px]">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                            <span className="font-semibold text-indigo-700">
                              {row.milestoneProgressPct}%
                            </span>
                            <span className="text-slate-400">
                              {row.milestonePaid}/{row.milestoneTotal} paid
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${progressBarClass(row.milestoneProgressPct)}`}
                              style={{ width: `${row.milestoneProgressPct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No milestones</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600 sm:px-6">
                      {formatStartedAt(row.startedAt)}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-800 sm:px-6">
                      {row.priceLkr > 0 ? formatLkr(row.priceLkr) : '—'}
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

export type { CustomSoftwareClientRow };
