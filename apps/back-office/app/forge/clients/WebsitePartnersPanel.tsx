'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatLkr } from '../../../lib/saas-billing';
import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import { fetchWebsitePartners, type WebsitePartnerRow } from './actions';

type WebsitePartnersPanelProps = {
  selectedId: string | null;
  onSelect: (row: WebsitePartnerRow | null) => void;
};

export default function WebsitePartnersPanel({ selectedId, onSelect }: WebsitePartnersPanelProps) {
  const [partners, setPartners] = useState<WebsitePartnerRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const result = await fetchWebsitePartners();
      if (cancelled) return;

      if (result.success) {
        setLoadError(null);
        setPartners(result.partners);
      } else {
        setLoadError(result.error ?? 'Failed to load web managers');
        setPartners([]);
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
    if (!needle) return partners;
    return partners.filter((row) => {
      const haystack = [row.displayName, row.email, row.referralCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [partners, query]);

  return (
    <div className={`${T.card} overflow-hidden`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Web managers</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Independent partners who bring website clients, manage them, and earn revenue share.
          </p>
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search web managers</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, referral…"
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
        <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className={T.tableHead}>
            <tr>
              <th className="px-4 py-3 sm:px-6">Manager</th>
              <th className="px-4 py-3 sm:px-6">Referral</th>
              <th className="px-4 py-3 sm:px-6">Website clients</th>
              <th className="px-4 py-3 sm:px-6">Status</th>
              <th className="px-4 py-3 text-right sm:px-6">Billed</th>
              <th className="px-4 py-3 text-right sm:px-6">Paid to manager</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="animate-pulse px-6 py-12 text-center text-slate-400">
                  Loading web managers…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  {query ? 'No managers match your search.' : 'No web managers registered yet.'}
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
                      <p className="font-semibold text-slate-900">{row.displayName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-500 sm:px-6">
                      {row.referralCode}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="font-semibold text-emerald-700">{row.websiteClientCount}</p>
                      {row.activePortfolioCount > row.websiteClientCount ? (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {row.activePortfolioCount} total portfolio
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          row.isActive
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-100 text-slate-500'
                        }`}
                      >
                        {row.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-800 sm:px-6">
                      {row.totalBilledLkr > 0 ? formatLkr(row.totalBilledLkr) : '—'}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-emerald-700 sm:px-6">
                      {row.totalPaidToPartnerLkr > 0
                        ? formatLkr(row.totalPaidToPartnerLkr)
                        : '—'}
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

export type { WebsitePartnerRow };
