'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import {
  partnerDealTypeLabel,
  type ForgePartnerDealType,
  type ForgePartnerPortfolioStatus,
} from '../../../../lib/forge-partners';
import {
  fetchPartnerPortfolioDetail,
  updatePartnerPortfolioEntry,
} from '../actions';

export default function PartnerPortfolioDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const [companyId, setCompanyId] = useState('');
  const [portfolio, setPortfolio] = useState<
    Awaited<ReturnType<typeof fetchPartnerPortfolioDetail>>['portfolio'] | null
  >(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [commercePurchaseCount, setCommercePurchaseCount] = useState(0);
  const [pearsShop, setPearsShop] = useState<
    Awaited<ReturnType<typeof fetchPartnerPortfolioDetail>>['pearsShop'] | null
  >(null);
  const [dealTypes, setDealTypes] = useState<ForgePartnerDealType[]>([]);
  const [statuses, setStatuses] = useState<ForgePartnerPortfolioStatus[]>([]);
  const [notes, setNotes] = useState('');
  const [dealType, setDealType] = useState<ForgePartnerDealType>('saas_erp');
  const [status, setStatus] = useState<ForgePartnerPortfolioStatus>('active');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    params.then((resolved) => setCompanyId(resolved.companyId));
  }, [params]);

  useEffect(() => {
    if (!companyId) return;

    setIsLoading(true);
    fetchPartnerPortfolioDetail(companyId).then((result) => {
      if (result.success) {
        setLoadError(null);
        setPortfolio(result.portfolio);
        setSubscriptionStatus(result.subscriptionStatus);
        setCommercePurchaseCount(result.commercePurchaseCount);
        setPearsShop(result.pearsShop ?? null);
        setDealTypes(result.dealTypes);
        setStatuses(result.statuses);
        setNotes(result.portfolio.notes ?? '');
        setDealType(result.portfolio.dealType);
        setStatus(result.portfolio.status);
      } else {
        setLoadError(result.error ?? 'Failed to load client');
      }
      setIsLoading(false);
    });
  }, [companyId]);

  const handleSave = () => {
    if (!portfolio) return;

    startTransition(async () => {
      setSaveMessage(null);
      const result = await updatePartnerPortfolioEntry({
        portfolioId: portfolio.id,
        dealType,
        status,
        notes,
      });

      if (!result.success) {
        setSaveMessage(result.error ?? 'Failed to save');
        return;
      }

      setSaveMessage('Portfolio updated.');
    });
  };

  if (isLoading) {
    return <p className="text-slate-500 animate-pulse font-mono text-sm">Loading client…</p>;
  }

  if (loadError || !portfolio) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {loadError ?? 'Client not found'}
        </div>
        <Link
          href="/partners/portfolio"
          className="text-xs font-bold uppercase tracking-wider text-cyan-400 hover:text-white"
        >
          Back to portfolio
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/partners/portfolio"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-cyan-300"
      >
        ← Portfolio
      </Link>

      {saveMessage ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {saveMessage}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-[#111118] p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Client</p>
        <h2 className="mt-2 text-2xl font-black text-white">{portfolio.companyName}</h2>
        {portfolio.productionDomain ? (
          <p className="mt-1 font-mono text-sm text-cyan-300">{portfolio.productionDomain}</p>
        ) : null}
        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-slate-500 text-xs uppercase font-bold">Subscription</dt>
            <dd className="mt-1 font-semibold text-white">{subscriptionStatus ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500 text-xs uppercase font-bold">Closed</dt>
            <dd className="mt-1 font-mono text-white">{portfolio.closedAt}</dd>
          </div>
          <div>
            <dt className="text-slate-500 text-xs uppercase font-bold">Commerce purchases</dt>
            <dd className="mt-1 font-semibold text-white">{commercePurchaseCount}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/partners/clients/${companyId}/setup`}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/20"
          >
            Client setup
          </Link>
        </div>
      </section>

      {portfolio.dealType === 'website_build' && pearsShop ? (
        <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 space-y-4">
          <h3 className="text-sm font-bold text-violet-200 uppercase tracking-widest">
            Client PEARS shop
          </h3>
          <p className="text-sm text-slate-300">
            Your client signs in with Google using their website purchase email to edit hero images
            and products. You retain oversight here — billing, domains, and portfolio notes.
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500 text-xs uppercase font-bold">Site published</dt>
              <dd className="mt-1 font-semibold text-white">
                {pearsShop.sitePublished ? 'Yes' : 'Not yet'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs uppercase font-bold">PEARS listed</dt>
              <dd className="mt-1 font-semibold text-white">
                {pearsShop.pearsListed ? 'Yes' : 'Pending'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs uppercase font-bold">Active products</dt>
              <dd className="mt-1 font-semibold text-white">{pearsShop.activeProductCount}</dd>
            </div>
            <div>
              <dt className="text-slate-500 text-xs uppercase font-bold">Hero image</dt>
              <dd className="mt-1 font-semibold text-white">
                {pearsShop.heroImageConfigured ? 'Configured' : 'Not set'}
              </dd>
            </div>
          </dl>
          <a
            href={pearsShop.clientLoginUrl}
            className="inline-flex rounded-lg border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-violet-100 hover:bg-violet-500/20"
          >
            Client login URL →
          </a>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-800 bg-[#111118] p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
          Portfolio details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase">Deal type</span>
            <select
              value={dealType}
              onChange={(e) => setDealType(e.target.value as ForgePartnerDealType)}
              className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
            >
              {dealTypes.map((type) => (
                <option key={type} value={type}>
                  {partnerDealTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ForgePartnerPortfolioStatus)}
              className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Referral code on row</span>
            <input
              value={portfolio.referralCode ?? '—'}
              readOnly
              className="w-full rounded-lg border border-slate-800 bg-[#0a0a0e] px-3 py-2 text-slate-400 font-mono"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          Save changes
        </button>
      </section>
    </div>
  );
}
