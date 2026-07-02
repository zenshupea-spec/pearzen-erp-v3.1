'use client';

import { useState, useTransition } from 'react';
import { Check, RefreshCw, RotateCcw, UserCircle2 } from 'lucide-react';
import { PhotoLightbox } from '../../om/verification-row-ui';
import type { TmMnrPhotoQueueRow } from './actions';
import {
  approveMnrPhotoSubmissionAction,
  requestMnrPhotoResubmitAction,
} from './actions';

function formatSubmittedAt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MnrPhotoApprovalClient({
  initialRows,
  loadError,
}: {
  initialRows: TmMnrPhotoQueueRow[];
  loadError?: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [isPending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ label: string; url: string } | null>(null);
  const [message, setMessage] = useState<string | null>(loadError ?? null);

  const handleApprove = (row: TmMnrPhotoQueueRow) => {
    setMessage(null);
    setActiveId(row.id);
    startTransition(async () => {
      const result = await approveMnrPhotoSubmissionAction(row.id);
      if (result.error) {
        setMessage(result.error);
        setActiveId(null);
        return;
      }
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setActiveId(null);
    });
  };

  const handleResubmit = (row: TmMnrPhotoQueueRow) => {
    setMessage(null);
    setActiveId(row.id);
    startTransition(async () => {
      const result = await requestMnrPhotoResubmitAction(
        row.id,
        'Photo not clear enough for shift verification — SM must recapture.',
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
          <UserCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
          <p className="font-black uppercase tracking-tight text-emerald-900">Queue clear</p>
          <p className="mt-1 text-sm text-emerald-700">No guard MNR photos awaiting approval.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 md:grid">
            <span>Sector manager</span>
            <span>Guard</span>
            <span>Submitted</span>
            <span className="text-right">Actions</span>
          </div>

          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const busy = isPending && activeId === row.id;
              return (
                <li
                  key={row.id}
                  className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm font-black text-slate-900">{row.smDisplayName}</p>
                    <p className="font-mono text-xs text-slate-500">{row.sm_epf}</p>
                  </div>

                  <div>
                    <p className="font-mono text-sm font-black text-slate-900">{row.guard_epf}</p>
                    <p className="truncate text-sm text-slate-600">{row.guard_name ?? '—'}</p>
                    <p className="truncate text-xs text-slate-500">{row.guard_site ?? 'No site'}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setLightbox({ label: `${row.guard_epf} MNR submission`, url: row.photo_url })
                      }
                      className="h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:border-violet-300 hover:shadow-sm"
                    >
                      <img
                        src={row.photo_url}
                        alt={`${row.guard_epf} submitted MNR`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <p className="text-xs text-slate-500">{formatSubmittedAt(row.created_at)}</p>
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
                      title="Approve to MNR master"
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

      {lightbox ? (
        <PhotoLightbox label={lightbox.label} url={lightbox.url} onClose={() => setLightbox(null)} />
      ) : null}
    </div>
  );
}
