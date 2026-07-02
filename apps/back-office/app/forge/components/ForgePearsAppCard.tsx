'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { SuperappExportJobRecord } from '../../../lib/superapp-store-export';
import { fetchPearsAppSummary } from '../pears/actions';
import { FORGE_PORTAL_THEME as T } from './forge-portal-theme';

function jobStatusLabel(status: SuperappExportJobRecord['status']): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'pending':
    default:
      return 'Pending';
  }
}

function jobStatusClass(status: SuperappExportJobRecord['status']): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'running':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700';
  }
}

function formatJobTime(job: SuperappExportJobRecord): string {
  const raw = job.completedAt ?? job.startedAt ?? job.createdAt;
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-LK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ForgePearsAppCard() {
  const [listingCount, setListingCount] = useState(0);
  const [snapshotTenantCount, setSnapshotTenantCount] = useState(0);
  const [lastJob, setLastJob] = useState<SuperappExportJobRecord | null>(null);
  const [futureHost, setFutureHost] = useState('pear.pearzen.tech');
  const [apiConfigured, setApiConfigured] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await fetchPearsAppSummary();
      if (cancelled) return;

      if (result.success) {
        setLoadError(null);
        setListingCount(result.summary.listingCount);
        setSnapshotTenantCount(result.summary.snapshotTenantCount);
        setLastJob(result.summary.lastJob);
        setFutureHost(result.summary.futureHost);
        setApiConfigured(result.summary.apiConfigured);
      } else {
        setLoadError(result.error ?? 'Could not load PEARS status');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`${T.card} overflow-hidden border-violet-200/80 bg-gradient-to-r from-white to-violet-50/30`}>
      <div className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700">PEARS App</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Super-app marketplace</h2>
          <p className="mt-1 text-sm text-slate-500">
            Website client shops list here. Future consumer app at{' '}
            <span className="font-mono text-violet-700">{futureHost}</span>.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700">
              {listingCount} listing consent{listingCount === 1 ? '' : 's'}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {snapshotTenantCount} store snapshot{snapshotTenantCount === 1 ? '' : 's'}
            </span>
            {lastJob ? (
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${jobStatusClass(lastJob.status)}`}
              >
                Last export {jobStatusLabel(lastJob.status)}
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                No exports yet
              </span>
            )}
          </div>

          {lastJob ? (
            <p className="mt-2 text-xs text-slate-400">
              {lastJob.companyName ?? 'Tenant'} · {formatJobTime(lastJob)}
            </p>
          ) : null}

          {loadError ? <p className="mt-2 text-xs text-amber-600">{loadError}</p> : null}
          {!apiConfigured ? (
            <p className="mt-2 text-xs text-slate-400">
              Set <span className="font-mono">SUPERAPP_EXPORT_SERVICE_TOKEN</span> for external PEARS
              API pulls.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/forge/superapp/exports"
            className="inline-flex items-center rounded-full border border-violet-300 bg-violet-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-violet-700"
          >
            Manage exports
          </Link>
          <span
            className="inline-flex cursor-not-allowed items-center rounded-full border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400"
            title={`Consumer app coming to ${futureHost}`}
          >
            Open {futureHost}
          </span>
        </div>
      </div>
    </div>
  );
}
