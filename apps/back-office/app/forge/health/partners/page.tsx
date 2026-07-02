'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatLkr } from '../../../../lib/saas-billing';
import type { ForgePartnerHealthRow } from '../../../../lib/forge-platform-health';
import { fetchForgePartnerHealthDashboard } from '../actions';
import ForgeHealthShell from '../components/ForgeHealthShell';

export default function ForgePartnerHealthPage() {
  const [partners, setPartners] = useState<ForgePartnerHealthRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const result = await fetchForgePartnerHealthDashboard();
      if (result.success) {
        setPartners(result.partners);
        setLoadError(null);
      } else {
        setLoadError(result.error ?? 'Failed to load partner health');
      }
      setIsLoading(false);
    })();
  }, []);

  const totals = partners.reduce(
    (acc, row) => ({
      closedClients: acc.closedClients + row.closedClients,
      activePortfolios: acc.activePortfolios + row.activePortfolios,
      partnerShare: acc.partnerShare + row.partnerShareLkr,
      pearzenShare: acc.pearzenShare + row.pearzenShareLkr,
    }),
    { closedClients: 0, activePortfolios: 0, partnerShare: 0, pearzenShare: 0 },
  );

  return (
    <ForgeHealthShell
      title="Partner Health"
      subtitle="Closed-client portfolio counts and cumulative payout ledger balances per service partner."
      activePath="/forge/health/partners"
      actions={
        <Link
          href="/forge/partners/payouts"
          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-200"
        >
          Payout audit →
        </Link>
      }
    >
      {loadError ? (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </p>
      ) : null}

      {!isLoading && partners.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-[#111118] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Partners</p>
            <p className="mt-1 text-2xl font-black text-white">{partners.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#111118] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Active portfolios
            </p>
            <p className="mt-1 text-2xl font-black text-white">{totals.activePortfolios}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#111118] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Partner share
            </p>
            <p className="mt-1 text-lg font-black text-white">{formatLkr(totals.partnerShare)}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-[#111118] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Pearzen share
            </p>
            <p className="mt-1 text-lg font-black text-white">{formatLkr(totals.pearzenShare)}</p>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111118] shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-800 bg-[#0a0a0e] text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Closed clients</th>
                <th className="px-4 py-3">Active links</th>
                <th className="px-4 py-3">Partner share</th>
                <th className="px-4 py-3">Pearzen share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500 animate-pulse">
                    Loading partner metrics…
                  </td>
                </tr>
              ) : partners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    No service partners registered yet.
                  </td>
                </tr>
              ) : (
                partners.map((partner) => (
                  <tr key={partner.partnerId} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <p className="font-bold text-white">{partner.displayName}</p>
                      <p className="text-xs text-slate-500">{partner.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          partner.isActive
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-600 bg-slate-800 text-slate-400'
                        }`}
                      >
                        {partner.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-200">{partner.closedClients}</td>
                    <td className="px-4 py-3 font-mono text-slate-200">{partner.activePortfolios}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">
                      {formatLkr(partner.partnerShareLkr)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">
                      {formatLkr(partner.pearzenShareLkr)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ForgeHealthShell>
  );
}
