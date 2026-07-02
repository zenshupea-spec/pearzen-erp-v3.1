'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import {
  fetchForgeTenantWebsites,
  forgeSetTenantWebsiteHostname,
  forgeUnpublishTenantWebsite,
  type ForgeTenantWebsiteRow,
} from './actions';
import type { TenantPublicSiteType } from '../../../../../lib/tenant-public-site-types';

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ForgeTenantWebsitesPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [rows, setRows] = useState<ForgeTenantWebsiteRow[]>([]);
  const [hostDrafts, setHostDrafts] = useState<Record<string, string>>({});
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
    const result = await fetchForgeTenantWebsites(companyId);
    if (result.success) {
      setCompanyName(result.companyName);
      setRows(result.rows);
      setHostDrafts(
        Object.fromEntries(result.rows.map((row) => [row.siteType, row.hostname ?? ''])),
      );
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load websites');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleSaveHostname = (siteType: TenantPublicSiteType) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await forgeSetTenantWebsiteHostname({
        companyId,
        siteType,
        hostname: hostDrafts[siteType]?.trim() || null,
      });
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to save hostname');
        return;
      }
      setActionMessage('Hostname updated.');
      await load();
    });
  };

  const handleUnpublish = (siteType: TenantPublicSiteType) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await forgeUnpublishTenantWebsite(companyId, siteType);
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to unpublish');
        return;
      }
      setActionMessage('Site unpublished.');
      await load();
    });
  };

  if (isLoading) {
    return <p className="text-slate-500 animate-pulse font-mono text-sm p-8">Loading websites…</p>;
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#0a0a0e] p-8 space-y-4">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {loadError}
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
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Tenant websites</h1>
          <p className="text-[10px] text-violet-400 font-mono font-bold uppercase tracking-widest mt-0.5">
            {companyName}
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
          Tenants edit copy at <code className="text-violet-200">/settings/public-website</code>. Forge
          operators can audit publish state, hostnames, and unpublish here.
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#111118] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0a0a0e] text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Hostname</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => (
                <tr key={row.siteType}>
                  <td className="px-4 py-3 font-medium text-white">{row.label}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                        row.isPublished
                          ? 'border-emerald-500/30 text-emerald-400'
                          : 'border-amber-500/30 text-amber-300'
                      }`}
                    >
                      {row.isPublished ? 'Published' : 'Draft'}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">{formatWhen(row.publishedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={hostDrafts[row.siteType] ?? ''}
                      onChange={(e) =>
                        setHostDrafts((prev) => ({ ...prev, [row.siteType]: e.target.value }))
                      }
                      className="w-full rounded border border-slate-700 bg-[#0a0a0e] px-2 py-1 font-mono text-xs text-white"
                      placeholder="hostname.example"
                    />
                  </td>
                  <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleSaveHostname(row.siteType)}
                      className="text-xs font-bold uppercase text-violet-300 hover:text-white disabled:opacity-50"
                    >
                      Save host
                    </button>
                    {row.isPublished ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleUnpublish(row.siteType)}
                        className="text-xs font-bold uppercase text-rose-400 hover:text-white disabled:opacity-50"
                      >
                        Unpublish
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
