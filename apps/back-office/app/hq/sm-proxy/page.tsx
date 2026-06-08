import Link from 'next/link';
import { ArrowLeft, Briefcase, ExternalLink, KeyRound } from 'lucide-react';

import { smPortalLoginUrl } from '../../../lib/tenant-host';
import { getSmProxyDashboard } from './actions';

export const dynamic = 'force-dynamic';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusPill(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'SUBMITTED' || normalized === 'PENDING') {
    return 'bg-amber-100 text-amber-800';
  }
  if (normalized === 'APPROVED' || normalized === 'CONFIRMED') {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (normalized === 'FLAGGED') {
    return 'bg-rose-100 text-rose-800';
  }
  return 'bg-slate-200 text-slate-700';
}

export default async function HQSMProxyPage() {
  const dashboard = await getSmProxyDashboard();
  const smPwaUrl = smPortalLoginUrl().replace(/\/login$/, '');

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-8 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 pt-2">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <Briefcase className="h-7 w-7 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900 md:text-3xl">
              SM field stream
            </h1>
            <p className="mt-1 text-sm font-bold uppercase tracking-widest text-slate-500">
              HQ view · roster submissions and site visits
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={smPwaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 shadow-sm transition-all hover:bg-amber-100"
          >
            <ExternalLink className="h-4 w-4" />
            Open SM portal
          </a>
          <Link
            href="/hr/sm-portal"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50"
          >
            <KeyRound className="h-4 w-4" />
            Portal access
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            HQ Hub
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Active sector managers
          </p>
          <p className="mt-1 text-3xl font-black text-slate-900">{dashboard.activeSmCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
            Rosters pending
          </p>
          <p className="mt-1 text-3xl font-black text-amber-900">{dashboard.pendingRosters}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">
            Visits awaiting review
          </p>
          <p className="mt-1 text-3xl font-black text-rose-900">
            {dashboard.pendingVisitVerifications}
          </p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
            SM portal
          </p>
          <p className="mt-2 text-xs font-medium leading-relaxed text-blue-900">
            Sector managers submit rosters, log site visits, and record handovers on the field PWA.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              Recent roster submissions
            </h2>
          </div>
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">Sector manager</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.recentRosters.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                    No roster submissions yet. SMs submit attendance from the SM portal.
                  </td>
                </tr>
              ) : (
                dashboard.recentRosters.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.smName ?? row.smEpf}</p>
                      <p className="font-mono text-[10px] text-slate-500">{row.smEpf}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-slate-700">{formatDate(row.shiftDate)}</p>
                      <p className="text-[10px] font-bold uppercase text-slate-500">{row.shiftType}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.siteName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusPill(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-600">
              Recent site visits
            </h2>
          </div>
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">Sector manager</th>
                <th className="px-4 py-3">Site</th>
                <th className="px-4 py-3">Visited</th>
                <th className="px-4 py-3">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboard.recentVisits.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                    No visit logs yet. SMs log site visits with GPS and selfie verification.
                  </td>
                </tr>
              ) : (
                dashboard.recentVisits.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.smName ?? row.smEpf}</p>
                      <p className="font-mono text-[10px] text-slate-500">{row.smEpf}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.siteName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {formatWhen(row.visitTime)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusPill(row.verificationStatus)}`}
                      >
                        {row.verificationStatus}
                      </span>
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
