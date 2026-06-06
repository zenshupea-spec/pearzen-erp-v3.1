'use client';

import { useCallback, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Package,
  RefreshCw,
  Truck,
} from 'lucide-react';
import {
  getUniformCourierQueue,
  markUniformCourierDispatched,
} from '../actions';
import type {
  UniformCourierQueueOverview,
  UniformCourierQueueRow,
} from '../lib/types';

function formatLkr(n: number | null) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `LKR ${n.toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function portalBadgeClass(portal: UniformCourierQueueRow['portal']) {
  switch (portal) {
    case 'TM':
      return 'bg-violet-100 text-violet-800';
    case 'OM':
      return 'bg-sky-100 text-sky-800';
    case 'SM':
      return 'bg-emerald-100 text-emerald-800';
    case 'HQ':
      return 'bg-indigo-100 text-indigo-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function CourierRequestCard({
  row,
  isDemo,
  onDispatched,
}: {
  row: UniformCourierQueueRow;
  isDemo: boolean;
  onDispatched: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dispatch = async () => {
    if (isDemo) {
      setError('Preview mode — run migrations first.');
      return;
    }
    if (!window.confirm(`Mark courier dispatched for ${row.guardEpf}? HQ warehouse stock will be reduced.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await markUniformCourierDispatched({
      requestId: row.id,
      dispatchNotes: notes,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Dispatch failed');
      return;
    }
    onDispatched();
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${portalBadgeClass(row.portal)}`}
            >
              {row.portal}
            </span>
            <span className="font-mono text-xs font-bold text-slate-500">
              {formatWhen(row.requestedAt)}
            </span>
          </div>
          <p className="mt-2 text-sm font-bold text-slate-900">
            Guard{' '}
            <span className="font-mono text-violet-700">{row.guardEpf}</span>
            {row.guardName ? (
              <span className="text-slate-600"> — {row.guardName}</span>
            ) : null}
          </p>
          <p className="text-xs text-slate-500">
            Requested by <span className="font-mono font-bold">{row.issuerEpf}</span>
          </p>
        </div>
        <p className="text-lg font-black tabular-nums text-slate-900">
          {formatLkr(row.totalAmountLkr)}
        </p>
      </div>

      <ul className="rounded-xl border border-slate-100 bg-slate-50/80 divide-y divide-slate-100">
        {row.items.map((line) => (
          <li
            key={`${row.id}-${line.item}`}
            className="flex items-center justify-between px-4 py-2 text-sm"
          >
            <span className="font-semibold text-slate-800">{line.item}</span>
            <span className="font-mono font-black text-slate-600">×{line.qty}</span>
          </li>
        ))}
      </ul>

      {row.status === 'PENDING' ? (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
            Dispatch notes (optional)
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Courier ref, tracking, handed to…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case"
            />
          </label>
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void dispatch()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-emerald-600/20 disabled:opacity-50 sm:w-auto"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Truck className="h-4 w-4" />
            )}
            Mark dispatched
          </button>
          <p className="text-xs text-slate-500">
            Deducts quantities from HQ warehouse stock on the Uniform stock page.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Dispatched {row.dispatchedAt ? formatWhen(row.dispatchedAt) : ''}</p>
            {row.courierDispatchNotes ? (
              <p className="mt-1 text-emerald-800/90">{row.courierDispatchNotes}</p>
            ) : null}
          </div>
        </div>
      )}
    </article>
  );
}

export default function UniformCourierWorkbench({
  initial,
}: {
  initial: UniformCourierQueueOverview;
}) {
  const [overview, setOverview] = useState(initial);
  const [tab, setTab] = useState<'pending' | 'dispatched'>('pending');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next = await getUniformCourierQueue();
    setOverview(next);
    setRefreshing(false);
  }, []);

  const list = tab === 'pending' ? overview.pending : overview.dispatched;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50">
            <Package className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">
              Uniform courier queue
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Courier requests from SM, TM, and OM portals. When you mark dispatched, HQ
              warehouse stock is reduced automatically.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {overview.isDemo && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Preview data — apply migrations for live courier requests from field portals.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
            tab === 'pending'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Pending ({overview.pending.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('dispatched')}
          className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
            tab === 'dispatched'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Dispatched ({overview.dispatched.length})
        </button>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center text-sm font-semibold text-slate-500">
          {tab === 'pending'
            ? 'No pending courier requests. New requests appear when SM / TM / OM submit Request Courier on the uniform page.'
            : 'No dispatched courier requests yet.'}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((row) => (
            <CourierRequestCard
              key={row.id}
              row={row}
              isDemo={overview.isDemo}
              onDispatched={() => void refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
