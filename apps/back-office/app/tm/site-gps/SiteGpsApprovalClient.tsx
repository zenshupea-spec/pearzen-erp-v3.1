'use client';

import { useState, useTransition } from 'react';
import { Check, MapPin, RefreshCw, RotateCcw } from 'lucide-react';
import {
  approveSiteGpsSubmissionAction,
  formatSiteGpsCoords,
  requestSiteGpsResubmitAction,
  type TmSiteGpsQueueRow,
} from './actions';

function formatSubmittedAt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapsHref(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function SiteGpsApprovalClient({
  initialRows,
  loadError,
}: {
  initialRows: TmSiteGpsQueueRow[];
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [isPending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(loadError ?? null);

  const handleApprove = (row: TmSiteGpsQueueRow) => {
    setMessage(null);
    setActiveId(row.id);
    startTransition(async () => {
      const result = await approveSiteGpsSubmissionAction(row.id);
      if (result.error) {
        setMessage(result.error);
        setActiveId(null);
        return;
      }
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setActiveId(null);
    });
  };

  const handleResubmit = (row: TmSiteGpsQueueRow) => {
    setMessage(null);
    setActiveId(row.id);
    startTransition(async () => {
      const result = await requestSiteGpsResubmitAction(
        row.id,
        'GPS not accurate enough — SM must recapture at the site entrance.',
      );
      if (result.error) {
        setMessage(result.error);
        setActiveId(null);
        return;
      }
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setActiveId(null);
    });
  };

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {message}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
          <p className="font-black uppercase tracking-tight text-emerald-900">Queue clear</p>
          <p className="mt-1 text-sm text-emerald-700">No site GPS submissions awaiting approval.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 md:grid">
            <span>Sector manager</span>
            <span>Site</span>
            <span>Coordinates</span>
            <span className="text-right">Actions</span>
          </div>

          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const busy = isPending && activeId === row.id;
              return (
                <li
                  key={row.id}
                  className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm font-black text-slate-900">{row.smDisplayName}</p>
                    <p className="font-mono text-xs text-slate-500">{row.sm_epf}</p>
                  </div>

                  <div>
                    <p className="text-sm font-black text-slate-900">{row.site_name}</p>
                    <p className="text-xs text-slate-500">{formatSubmittedAt(row.created_at)}</p>
                  </div>

                  <div>
                    <a
                      href={mapsHref(row.latitude, row.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm font-bold text-violet-700 hover:text-violet-900"
                    >
                      {formatSiteGpsCoords(row.latitude, row.longitude)}
                    </a>
                    {row.accuracy_m != null ? (
                      <p className="text-xs text-slate-500">±{Math.round(row.accuracy_m)} m accuracy</p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleResubmit(row)}
                      title="Request resubmit"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-700 text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleApprove(row)}
                      title="Approve to site directory"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-800 text-white shadow-sm transition hover:bg-indigo-900 disabled:opacity-50"
                    >
                      {busy ? (
                        <span className="text-sm font-black">…</span>
                      ) : (
                        <Check className="h-4 w-4 stroke-[2.5]" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600"
      >
        <RefreshCw className="h-4 w-4" />
        Refresh queue
      </button>
    </div>
  );
}
