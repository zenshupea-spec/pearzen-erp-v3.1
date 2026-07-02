'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import {
  partnerDealTypeLabel,
  type ForgePartnerDealType,
  type ForgePartnerPortfolioStatus,
} from '../../../lib/forge-partners';
import {
  createPartnerPortfolioEntry,
  fetchLinkableCompaniesForPartner,
  fetchPartnerPortfolioList,
  updatePartnerPortfolioEntry,
  type PartnerPortfolioListItem,
} from './actions';

function statusBadgeClass(status: ForgePartnerPortfolioStatus): string {
  return status === 'active'
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}

export default function PartnersPortfolioPage() {
  const [portfolios, setPortfolios] = useState<PartnerPortfolioListItem[]>([]);
  const [dealTypes, setDealTypes] = useState<ForgePartnerDealType[]>([]);
  const [companies, setCompanies] = useState<
    Awaited<ReturnType<typeof fetchLinkableCompaniesForPartner>>['companies']
  >([]);
  const [partnerReferralCode, setPartnerReferralCode] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [dealType, setDealType] = useState<ForgePartnerDealType>('saas_erp');
  const [closedAt, setClosedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [useReferralCode, setUseReferralCode] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const [portfolioResult, companyResult] = await Promise.all([
      fetchPartnerPortfolioList(),
      fetchLinkableCompaniesForPartner(),
    ]);

    if (portfolioResult.success) {
      setLoadError(null);
      setPortfolios(portfolioResult.portfolios);
      setDealTypes(portfolioResult.dealTypes);
      setPartnerReferralCode(portfolioResult.partnerReferralCode);
    } else {
      setLoadError(portfolioResult.error ?? 'Failed to load portfolio');
    }

    if (companyResult.success) {
      setCompanies(companyResult.companies);
      if (!companyId && companyResult.companies[0]) {
        setCompanyId(companyResult.companies[0].id);
      }
    }

    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = () => {
    startTransition(async () => {
      setFormMessage(null);
      const result = await createPartnerPortfolioEntry({
        companyId,
        dealType,
        closedAt,
        notes: notes || null,
        usePartnerReferralCode: useReferralCode,
      });

      if (!result.success) {
        setFormMessage(result.error ?? 'Failed to add client');
        return;
      }

      setFormMessage('Client linked to your portfolio.');
      setNotes('');
      await load();
    });
  };

  const handleStatusToggle = (portfolio: PartnerPortfolioListItem) => {
    const nextStatus: ForgePartnerPortfolioStatus =
      portfolio.status === 'active' ? 'churned' : 'active';

    startTransition(async () => {
      setFormMessage(null);
      const result = await updatePartnerPortfolioEntry({
        portfolioId: portfolio.id,
        status: nextStatus,
      });

      if (!result.success) {
        setFormMessage(result.error ?? 'Failed to update status');
        return;
      }

      await load();
    });
  };

  return (
    <div className="space-y-8">
      {loadError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {loadError}
        </div>
      ) : null}
      {formMessage ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {formMessage}
        </div>
      ) : null}

      <div className="bg-[#111118] border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
          Link closed client
        </h2>
        <p className="text-xs text-slate-500">
          Attach a Pearzen tenant you referred. Your referral code{' '}
          <span className="font-mono text-cyan-300">{partnerReferralCode || '—'}</span> can be
          stamped on the portfolio row for payout tracking.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Tenant company</span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              disabled={isLoading || companies.length === 0}
              className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white disabled:opacity-50"
            >
              {companies.length === 0 ? (
                <option value="">All tenants already linked</option>
              ) : (
                companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                    {company.slug ? ` (${company.slug})` : ''}
                  </option>
                ))
              )}
            </select>
          </label>

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
            <span className="text-xs font-bold text-slate-500 uppercase">Closed date</span>
            <input
              type="date"
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Notes (optional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contract reference, intro source, etc."
              className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
            />
          </label>

          <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={useReferralCode}
              onChange={(e) => setUseReferralCode(e.target.checked)}
              className="rounded border-slate-600"
            />
            Stamp my referral code on this portfolio row
          </label>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending || !companyId || companies.length === 0}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-cyan-500 disabled:opacity-50"
        >
          Add to portfolio
        </button>
      </div>

      <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
            Closed clients
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Deal</th>
                <th className="px-6 py-3">Closed</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 animate-pulse">
                    Loading portfolio…
                  </td>
                </tr>
              ) : portfolios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No closed clients yet. Link your first tenant above.
                  </td>
                </tr>
              ) : (
                portfolios.map((portfolio) => (
                  <tr key={portfolio.id}>
                    <td className="px-6 py-4">
                      <Link
                        href={`/partners/portfolio/${portfolio.companyId}`}
                        className="font-bold text-white hover:text-cyan-300"
                      >
                        {portfolio.companyName}
                      </Link>
                      {portfolio.productionDomain ? (
                        <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                          {portfolio.productionDomain}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {partnerDealTypeLabel(portfolio.dealType)}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">{portfolio.closedAt}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-black uppercase border ${statusBadgeClass(portfolio.status)}`}
                      >
                        {portfolio.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleStatusToggle(portfolio)}
                        disabled={isPending}
                        className="text-xs font-bold text-amber-400 hover:text-white uppercase disabled:opacity-50"
                      >
                        {portfolio.status === 'active' ? 'Mark churned' : 'Reactivate'}
                      </button>
                      <Link
                        href={`/partners/clients/${portfolio.companyId}/setup`}
                        className="text-xs font-bold text-violet-400 hover:text-white uppercase"
                      >
                        Setup
                      </Link>
                      <Link
                        href={`/partners/portfolio/${portfolio.companyId}`}
                        className="text-xs font-bold text-cyan-400 hover:text-white uppercase"
                      >
                        View
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
