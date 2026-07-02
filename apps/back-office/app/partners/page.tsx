'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { formatLkr } from '../../lib/saas-billing';
import { fetchPartnerDashboard } from './actions';

export default function PartnersHomePage() {
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof fetchPartnerDashboard>
  > | null>(null);

  useEffect(() => {
    fetchPartnerDashboard().then(setSnapshot);
  }, []);

  const data = snapshot?.success ? snapshot.data : null;
  const loadError = snapshot && !snapshot.success ? snapshot.error : null;

  return (
    <div className="space-y-8">
      {loadError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {loadError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-[#111118] p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Welcome</p>
        <h2 className="mt-2 text-2xl font-black text-white">
          {data?.partnerName ?? 'Partner'}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Referral code{' '}
          <span className="font-mono font-bold text-cyan-300">{data?.referralCode ?? '—'}</span>
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-[#111118] p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Closed clients
          </p>
          <p className="mt-2 text-3xl font-black text-white">
            {data ? data.portfolioCount : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#111118] p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Active accounts
          </p>
          <p className="mt-2 text-3xl font-black text-emerald-400">
            {data ? data.activePortfolioCount : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#111118] p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Payout balance
          </p>
          <p className="mt-2 text-2xl font-black text-cyan-300">
            {data ? formatLkr(data.payoutBalanceLkr) : '—'}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
        <h3 className="text-sm font-bold uppercase tracking-widest text-cyan-200">
          Workspace modules
        </h3>
        <p className="mt-2 text-sm text-cyan-100/80">
          Link closed clients in Portfolio. When Forge enables assist toggles, configure domains and
          PayHere at Client setup.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/partners/portfolio"
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/20"
          >
            Portfolio
          </Link>
          <Link
            href="/partners/payouts"
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/20"
          >
            Payouts
          </Link>
        </div>
      </section>
    </div>
  );
}
