'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { formatLkr } from '../../../lib/saas-billing';
import { FORGE_PORTAL_THEME as T } from '../components/forge-portal-theme';
import {
  fetchForgePartnersHub,
  type ForgePartnerHubRow,
  type ForgePartnersHubSummary,
} from './actions';

function formatLkrCompact(value: number): string {
  if (value >= 1_000_000) return `LKR ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `LKR ${Math.round(value / 1_000)}k`;
  return formatLkr(value);
}

function SummaryCard({
  label,
  value,
  hint,
  accent = 'text-slate-900',
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className={`${T.card} p-5`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function PayoutRulesStrip({ summary }: { summary: ForgePartnersHubSummary }) {
  const { payoutRules } = summary;

  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-r from-white to-cyan-50/40 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-700">
          Website revenue split (current rules)
        </p>
        <Link
          href="/forge/settings/pricing"
          className="text-[10px] font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
        >
          Edit pricing →
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
        <span>
          <strong>Month 1</strong> client {formatLkr(payoutRules.monthOneClientLkr)} · Pearzen{' '}
          {formatLkr(payoutRules.monthOnePearzenLkr)} · Manager {formatLkr(payoutRules.monthOnePartnerLkr)}
        </span>
        <span className="hidden text-slate-300 sm:inline">|</span>
        <span>
          <strong>Month 2+</strong> client {formatLkr(payoutRules.monthTwoPlusClientLkr)} · Pearzen{' '}
          {formatLkr(payoutRules.monthTwoPlusPearzenLkr)} · Manager{' '}
          {formatLkr(payoutRules.monthTwoPlusPartnerLkr)}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Ledger entries post when website invoices are marked paid.
      </p>
    </div>
  );
}

function PortfolioMix({ row }: { row: ForgePartnerHubRow }) {
  const parts: string[] = [];
  if (row.websiteClientCount > 0) parts.push(`${row.websiteClientCount} web`);
  if (row.erpClientCount > 0) parts.push(`${row.erpClientCount} ERP`);
  if (row.wfmClientCount > 0) parts.push(`${row.wfmClientCount} WFM`);
  if (row.customClientCount > 0) parts.push(`${row.customClientCount} custom`);

  if (parts.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return <span className="text-xs text-slate-500">{parts.join(' · ')}</span>;
}

export default function ForgePartnersHubPage() {
  const [partners, setPartners] = useState<ForgePartnerHubRow[]>([]);
  const [summary, setSummary] = useState<ForgePartnersHubSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const result = await fetchForgePartnersHub();
      if (cancelled) return;

      if (result.success) {
        setPartners(result.partners);
        setSummary(result.summary);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? 'Failed to load partners');
        setSummary(null);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Partner hub</h1>
          <p className={`mt-1 max-w-2xl ${T.sectionDesc}`}>
            Performance overview for independent web managers and service partners — website clients,
            billed revenue, and cumulative payout ledger shares.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/forge/clients?segment=websites"
            className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-800 hover:bg-emerald-100"
          >
            Client hub
          </Link>
          <Link
            href="/forge/partners/payouts"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:border-violet-200 hover:text-violet-700"
          >
            Payout audit
          </Link>
          <Link
            href="/forge/partners/assist"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:border-violet-200 hover:text-violet-700"
          >
            Assist grants
          </Link>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <SummaryCard
              label="Partners"
              value={String(summary.partnerCount)}
              hint={`${summary.activePartnerCount} active`}
            />
            <SummaryCard
              label="Website clients"
              value={String(summary.websiteClientCount)}
              hint={`${summary.totalActivePortfolios} active portfolios`}
              accent="text-emerald-700"
            />
            <SummaryCard
              label="Website billed"
              value={formatLkrCompact(summary.totalBilledLkr)}
              hint="Commerce invoices"
            />
            <SummaryCard
              label="Paid to managers"
              value={formatLkrCompact(summary.totalPaidToPartnerLkr)}
              hint="Ledger partner share"
              accent="text-cyan-700"
            />
            <SummaryCard
              label="Pearzen share"
              value={formatLkrCompact(summary.totalPearzenShareLkr)}
              hint="Ledger cumulative"
              accent="text-violet-700"
            />
            <SummaryCard
              label="Top performer"
              value={
                partners[0]?.websiteClientCount
                  ? partners[0].displayName.split(' ')[0]
                  : '—'
              }
              hint={
                partners[0]?.websiteClientCount
                  ? `${partners[0].websiteClientCount} website client${partners[0].websiteClientCount === 1 ? '' : 's'}`
                  : 'No clients yet'
              }
            />
          </div>

          <PayoutRulesStrip summary={summary} />
        </>
      ) : null}

      <div className={`${T.card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">All partners</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Sorted by website clients, then lifetime manager payouts.
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search partners</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, referral…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 pl-9 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className={T.tableHead}>
              <tr>
                <th className="px-4 py-3 sm:px-6">Partner</th>
                <th className="px-4 py-3 sm:px-6">Referral</th>
                <th className="px-4 py-3 sm:px-6">Website clients</th>
                <th className="px-4 py-3 sm:px-6">Portfolio mix</th>
                <th className="px-4 py-3 text-right sm:px-6">Billed</th>
                <th className="px-4 py-3 text-right sm:px-6">Manager paid</th>
                <th className="px-4 py-3 text-right sm:px-6">Pearzen</th>
                <th className="px-4 py-3 sm:px-6">Status</th>
                <th className="px-4 py-3 sm:px-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="animate-pulse px-6 py-12 text-center text-slate-400">
                    Loading partner performance…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                    {query ? 'No partners match your search.' : 'No service partners registered yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className={T.tableRow}>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="font-semibold text-slate-900">{row.displayName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-500 sm:px-6">
                      {row.referralCode}
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <p className="text-lg font-bold text-emerald-700">{row.websiteClientCount}</p>
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <PortfolioMix row={row} />
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-slate-800 sm:px-6">
                      {row.totalBilledLkr > 0 ? formatLkr(row.totalBilledLkr) : '—'}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-cyan-700 sm:px-6">
                      {row.totalPaidToPartnerLkr > 0
                        ? formatLkr(row.totalPaidToPartnerLkr)
                        : '—'}
                    </td>
                    <td className="px-4 py-4 text-right text-violet-700 sm:px-6">
                      {row.totalPearzenShareLkr > 0 ? formatLkr(row.totalPearzenShareLkr) : '—'}
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
                    <td className="px-4 py-4 sm:px-6">
                      <Link
                        href={`/forge/partners/${row.id}`}
                        className="text-xs font-bold uppercase tracking-wider text-violet-600 hover:text-violet-800"
                      >
                        View →
                      </Link>
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
