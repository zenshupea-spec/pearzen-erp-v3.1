'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import {
  tenantCustomDomainTypeLabel,
  tenantDomainSslStatusLabel,
  type TenantCustomDomainType,
  type TenantDomainSslStatus,
} from '../../../../../lib/tenant-assist-setup';
import {
  deleteForgeTenantDomain,
  fetchForgeTenantDomainContext,
  updateForgeTenantDomainStatus,
  upsertForgeTenantDomain,
  type ForgeTenantDomainContext,
} from './actions';

function sslBadgeClass(status: TenantDomainSslStatus): string {
  if (status === 'active') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (status === 'error') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
}

export default function ForgeTenantDomainsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const [companyId, setCompanyId] = useState('');
  const [context, setContext] = useState<ForgeTenantDomainContext | null>(null);
  const [domains, setDomains] = useState<
    Awaited<ReturnType<typeof fetchForgeTenantDomainContext>>['domains']
  >([]);
  const [domainTypes, setDomainTypes] = useState<TenantCustomDomainType[]>([]);
  const [sslStatuses, setSslStatuses] = useState<TenantDomainSslStatus[]>([]);
  const [hostname, setHostname] = useState('');
  const [domainType, setDomainType] = useState<TenantCustomDomainType>('erp_staff');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    params.then((resolved) => setCompanyId(resolved.companyId));
  }, [params]);

  const load = async () => {
    if (!companyId) return;
    setIsLoading(true);
    const result = await fetchForgeTenantDomainContext(companyId);
    if (result.success) {
      setContext(result.context);
      setDomains(result.domains);
      setDomainTypes(result.domainTypes);
      setSslStatuses(result.sslStatuses);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load domains');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleAddDomain = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await upsertForgeTenantDomain({ companyId, hostname, domainType });
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to add domain');
        return;
      }
      setHostname('');
      setActionMessage('Domain saved. Set SSL status to Active after DNS is live.');
      await load();
    });
  };

  const handleStatusChange = (domainId: string, sslStatus: TenantDomainSslStatus) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await updateForgeTenantDomainStatus({
        companyId,
        domainId,
        sslStatus,
        markVerified: sslStatus === 'active',
      });
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to update status');
        return;
      }
      setActionMessage('Domain status updated — middleware cache refreshes within one minute.');
      await load();
    });
  };

  const handleDelete = (domainId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await deleteForgeTenantDomain({ companyId, domainId });
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to remove domain');
        return;
      }
      setActionMessage('Domain removed.');
      await load();
    });
  };

  if (isLoading) {
    return <p className="text-slate-500 animate-pulse font-mono text-sm p-8">Loading domains…</p>;
  }

  if (loadError || !context) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] p-8 space-y-4">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {loadError ?? 'Tenant not found'}
        </div>
        <Link href="/forge/tenants" className="text-xs font-bold uppercase text-violet-400">
          Back to tenants
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      <div className="bg-[#111118] border-b border-violet-500/20 sticky top-0 z-50 px-6 py-4 flex items-center gap-4 shadow-lg">
        <Link
          href="/forge/tenants"
          className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Custom domains</h1>
          <p className="text-[10px] text-violet-400 font-mono font-bold uppercase tracking-widest mt-0.5">
            {context.companyName}
            {context.companySlug ? ` · ${context.companySlug}` : ''}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {actionMessage ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {actionMessage}
          </div>
        ) : null}

        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 text-sm text-violet-100">
          Domains route traffic only when <strong>SSL status is Active</strong>. Point DNS at the
          correct Pearzen deploy, then mark active here.{' '}
          <code className="text-violet-200">erp_staff</code> serves tenant portals;{' '}
          <code className="text-violet-200">security_website</code> serves public marketing + client
          login; <code className="text-violet-200">customer_menu</code> redirects to the menu PWA.
        </div>

        <section className="rounded-2xl border border-slate-800 bg-[#111118] p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Add domain</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Hostname</span>
              <input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="classicventuresecurity.com"
                className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Type</span>
              <select
                value={domainType}
                onChange={(e) => setDomainType(e.target.value as TenantCustomDomainType)}
                className="w-full rounded-lg border border-slate-700 bg-[#0a0a0e] px-3 py-2 text-white"
              >
                {domainTypes.map((type) => (
                  <option key={type} value={type}>
                    {tenantCustomDomainTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={handleAddDomain}
            disabled={isPending || !hostname.trim()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Add domain
          </button>
        </section>

        <div className="rounded-2xl border border-slate-800 bg-[#111118] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Hostname</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">SSL</th>
                  <th className="px-4 py-3">Verified</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {domains.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No custom domains yet.
                    </td>
                  </tr>
                ) : (
                  domains.map((domain) => (
                    <tr key={domain.id}>
                      <td className="px-4 py-3 font-mono text-violet-300">{domain.hostname}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {tenantCustomDomainTypeLabel(domain.domainType)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={domain.sslStatus}
                          onChange={(e) =>
                            handleStatusChange(domain.id, e.target.value as TenantDomainSslStatus)
                          }
                          disabled={isPending}
                          className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase bg-[#0a0a0e] ${sslBadgeClass(domain.sslStatus)}`}
                        >
                          {sslStatuses.map((status) => (
                            <option key={status} value={status} className="bg-[#111118] text-white">
                              {tenantDomainSslStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {domain.verifiedAt ? domain.verifiedAt.slice(0, 10) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(domain.id)}
                          disabled={isPending}
                          className="text-xs font-bold uppercase text-rose-400 hover:text-white disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
