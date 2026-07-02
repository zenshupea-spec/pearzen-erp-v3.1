'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatLkr } from '../../../lib/saas-billing';
import { fetchForgePartnersHub } from '../partners/actions';
import { FORGE_PORTAL_THEME as T } from './forge-portal-theme';

function formatLkrCompact(value: number): string {
  if (value >= 1_000_000) return `LKR ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `LKR ${Math.round(value / 1_000)}k`;
  return formatLkr(value);
}

export default function ForgePartnersHubCard() {
  const [partnerCount, setPartnerCount] = useState(0);
  const [websiteClientCount, setWebsiteClientCount] = useState(0);
  const [totalPaidLkr, setTotalPaidLkr] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await fetchForgePartnersHub();
      if (cancelled) return;

      if (result.success) {
        setLoadError(null);
        setPartnerCount(result.summary.partnerCount);
        setWebsiteClientCount(result.summary.websiteClientCount);
        setTotalPaidLkr(result.summary.totalPaidToPartnerLkr);
      } else {
        setLoadError(result.error ?? 'Could not load partners');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`${T.card} overflow-hidden border-cyan-200/80 bg-gradient-to-r from-white to-cyan-50/30`}>
      <div className="flex h-full flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-700">Partners</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Web managers</h2>
          <p className="mt-1 text-sm text-slate-500">
            Independent sales partners — website clients, revenue share, and disbursements.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-700">
              {partnerCount} manager{partnerCount === 1 ? '' : 's'}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              {websiteClientCount} website client{websiteClientCount === 1 ? '' : 's'}
            </span>
            {totalPaidLkr > 0 ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {formatLkrCompact(totalPaidLkr)} accrued
              </span>
            ) : null}
          </div>

          {loadError ? <p className="mt-2 text-xs text-amber-600">{loadError}</p> : null}
        </div>

        <Link
          href="/forge/partners"
          className="inline-flex shrink-0 items-center rounded-full border border-cyan-300 bg-cyan-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-cyan-700"
        >
          Partner hub
        </Link>
      </div>
    </div>
  );
}
