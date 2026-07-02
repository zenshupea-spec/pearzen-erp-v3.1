'use client';

import { useEffect, useState, useTransition } from 'react';

import type { SuperappPearsExportBundle } from '../../../../lib/superapp-anchor-tenant';
import type { SuperappExportJobRecord } from '../../../../lib/superapp-store-export';
import { tenantProductionDomain } from '../../../../lib/tenant-host';
import {
  fetchSuperappExportsDashboard,
  runSuperappStoreProfileExportAction,
  seedAnchorPearsExportAction,
  updateForgeAnchorTenantAction,
  type SuperappExportCompanyRow,
} from './actions';
import { formatHealthTimestamp } from '../../health/components/ForgeHealthShell';

function downloadJson(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function jobStatusClass(status: SuperappExportJobRecord['status']): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    case 'failed':
      return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
    case 'running':
      return 'border-sky-500/20 bg-sky-500/10 text-sky-300';
    default:
      return 'border-slate-600 bg-slate-800 text-slate-400';
  }
}

export default function ForgeSuperappExportsPage() {
  const [companies, setCompanies] = useState<SuperappExportCompanyRow[]>([]);
  const [jobs, setJobs] = useState<SuperappExportJobRecord[]>([]);
  const [anchorBundle, setAnchorBundle] = useState<SuperappPearsExportBundle | null>(null);
  const [anchorCompanyId, setAnchorCompanyId] = useState<string | null>(null);
  const [anchorReference, setAnchorReference] = useState<{
    companyId: string;
    tenantSlug: string;
    displayName: string;
    securityHostname: string;
    menuHostname: string;
  } | null>(null);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    setIsLoading(true);
    const result = await fetchSuperappExportsDashboard();
    if (result.success) {
      setCompanies(result.companies);
      setJobs(result.jobs);
      setAnchorBundle(result.anchorBundle);
      setAnchorCompanyId(result.anchorCompanyId);
      setAnchorReference(result.anchorReference);
      setApiConfigured(result.apiConfigured);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? 'Failed to load exports');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSeedAnchor = () => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await seedAnchorPearsExportAction();
      if (!result.success) {
        setActionMessage(result.error ?? 'Seed failed');
        return;
      }
      downloadJson(result.json, result.filename);
      setActionMessage(
        `Anchor tenant Pears profile seeded — consent, site hostnames, store snapshot, and inventory bundle ready.`,
      );
      await load();
    });
  };

  const handleAnchorChange = (companyId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await updateForgeAnchorTenantAction(companyId);
      if (!result.success) {
        setActionMessage(result.error ?? 'Failed to update anchor tenant');
        return;
      }
      setActionMessage('Anchor tenant updated.');
      await load();
    });
  };

  const handleDownloadAnchorBundle = () => {
    if (!anchorBundle) return;
    downloadJson(
      JSON.stringify(anchorBundle, null, 2),
      `anchor-pears-export-${anchorBundle.tenantSlug}-${anchorBundle.seededAt.slice(0, 10)}.json`,
    );
  };

  const handleExport = (companyId: string) => {
    startTransition(async () => {
      setActionMessage(null);
      const result = await runSuperappStoreProfileExportAction(companyId);
      if (!result.success) {
        setActionMessage(result.error ?? 'Export failed');
        return;
      }
      setActionMessage(
        `Store profile exported — snapshot ${result.snapshotId?.slice(0, 8)} at ${formatHealthTimestamp(result.exportedAt)}.`,
      );
      await load();
    });
  };

  const apiExample = anchorCompanyId
    ? `/api/superapp/v1/store-profile/${anchorCompanyId}`
    : '/api/superapp/v1/store-profile/{anchor-company-id}';
  const inventoryExample = anchorCompanyId
    ? `/api/superapp/v1/inventory/${anchorCompanyId}`
    : '/api/superapp/v1/inventory/{anchor-company-id}';

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          ←{' '}
          <a href="/forge" className="hover:text-indigo-300">
            Forge home
          </a>
        </p>
        <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">
          Pears Store Exports
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Read-only store profile snapshots for the Pears super-app. Tenant ERP stays the source of
          truth.
        </p>
      </div>

      {anchorReference ? (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">
                Anchor tenant · Pears reference
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {anchorReference.displayName} · slug{' '}
                <code className="text-amber-200">{anchorReference.tenantSlug}</code>
              </p>
              {companies.length > 0 ? (
                <label className="mt-3 block text-xs text-slate-400">
                  <span className="font-bold uppercase tracking-wider text-slate-500">Change anchor</span>
                  <select
                    value={anchorCompanyId ?? ''}
                    disabled={isPending}
                    onChange={(e) => handleAnchorChange(e.target.value)}
                    className="mt-1 w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                        {company.slug ? ` (${company.slug})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={handleSeedAnchor}
                className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-100 disabled:opacity-50"
              >
                {isPending ? 'Seeding…' : 'Seed & export anchor profile'}
              </button>
              {anchorBundle ? (
                <button
                  type="button"
                  onClick={handleDownloadAnchorBundle}
                  className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-white"
                >
                  Download JSON
                </button>
              ) : null}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">Asset</th>
                  <th className="px-4 py-2">Pears listing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="px-4 py-2 font-mono">ERP tenant {anchorReference.tenantSlug}</td>
                  <td className="px-4 py-2">Business account · {anchorReference.displayName}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono">{anchorReference.securityHostname}</td>
                  <td className="px-4 py-2">Public security services profile</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono">{anchorReference.menuHostname}</td>
                  <td className="px-4 py-2">Hospitality / café storefront</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Custom ERP portals</td>
                  <td className="px-4 py-2 text-slate-500">Private — not listed</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Seed action: listing consent (products + booking), public-site hostnames, store-profile
            snapshot job, and inventory bundle JSON.
            {anchorBundle
              ? ` Last snapshot ${formatHealthTimestamp(anchorBundle.seededAt)}.`
              : ' No snapshot yet — run seed above.'}
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-300">
          Pears API
        </h2>
        <p className="text-sm text-slate-300">
          Authenticate with{' '}
          <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-violet-200">
            Authorization: Bearer $SUPERAPP_EXPORT_SERVICE_TOKEN
          </code>
        </p>
        {!apiConfigured ? (
          <p className="text-xs text-amber-300">
            Set <code className="text-amber-200">SUPERAPP_EXPORT_SERVICE_TOKEN</code> in env before
            Pears can pull snapshots.
          </p>
        ) : (
          <p className="text-xs text-emerald-300">Service token configured on this deploy.</p>
        )}
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 font-mono text-xs text-slate-400 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Store profile</p>
          <p>
            <span className="text-sky-300">GET</span> {apiExample}
          </p>
          <p>
            <span className="text-sky-300">GET</span> {apiExample}?mode=live
          </p>
          <p>
            <span className="text-emerald-300">POST</span> {apiExample}
          </p>
          <p>
            <span className="text-sky-300">GET</span> /api/superapp/v1/export-jobs/{'{jobId}'}?companyId={'{tenant-uuid}'}
          </p>
          <p className="text-xs text-amber-200/90">
            Platform token is Pears-only — rotate with{' '}
            <code className="text-amber-100">npm run rotate:superapp-export-token</code>. Store profile
            and inventory require MD listing consent at{' '}
            <code className="text-slate-400">/settings/superapp</code>.
          </p>
          <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Inventory (read-only)
          </p>
          <p>
            <span className="text-sky-300">GET</span> {inventoryExample}
          </p>
          <p>
            <span className="text-sky-300">GET</span> {inventoryExample}?vertical=cafe,retail
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Café menu uses POS-synced items; retail requires <code className="text-slate-400">published=true</code>; salon uses active products only. Store profile GET/POST and inventory GET require MD opt-in at <code className="text-slate-400">/settings/superapp</code>.
        </p>
        <p className="text-xs text-slate-500">
          Optional{' '}
          <code className="text-slate-400">SUPERAPP_OWNER_PROFILE_BY_COMPANY</code> JSON maps tenant
          company IDs to Pears owner profile IDs.
        </p>
      </section>

      {loadError ? (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {actionMessage}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
          Tenants
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111118]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-[#0a0a0e] text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Last snapshot</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-500 animate-pulse">
                    Loading tenants…
                  </td>
                </tr>
              ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                    No tenants found.
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr key={company.id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <p className="font-bold text-white">{company.name}</p>
                      <p className="text-xs text-slate-500">
                        {company.slug ? tenantProductionDomain(company.slug) : company.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {formatHealthTimestamp(company.latestSnapshotAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleExport(company.id)}
                        className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-violet-200 disabled:opacity-50"
                      >
                        Export profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
          Recent export jobs
        </h2>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111118]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-[#0a0a0e] text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested by</th>
                <th className="px-4 py-3">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500 animate-pulse">
                    Loading jobs…
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    No export jobs yet — run an export above.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <p className="font-bold text-white">{job.companyName ?? 'Tenant'}</p>
                      <p className="font-mono text-[10px] text-slate-500">{job.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${jobStatusClass(job.status)}`}
                      >
                        {job.status}
                      </span>
                      {job.errorMessage ? (
                        <p className="mt-1 text-xs text-rose-300">{job.errorMessage}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {job.requestedBy ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {formatHealthTimestamp(job.completedAt ?? job.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
