'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { confirmUniformCollection, getUniformCollectionQueue } from '../actions';
import { useDeductionsPayrollMonth } from '../DeductionsPayrollMonthContext';
import { mergeReturnedAgainstIssued } from '../../../../lib/uniform-collection/issued-history';
import type {
  UniformCollectionQueueOverview,
  UniformCollectionQueueRow,
  UniformCourierItem,
} from '../lib/types';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildReturnedDraft(issued: UniformCourierItem[]): Record<string, number> {
  const draft: Record<string, number> = {};
  for (const line of issued) {
    draft[line.item] = 0;
  }
  return draft;
}

function CollectionPendingCard({
  row,
  isDemo,
  onConfirmed,
}: {
  row: UniformCollectionQueueRow;
  isDemo: boolean;
  onConfirmed: () => void;
}) {
  const [returnedByItem, setReturnedByItem] = useState<Record<string, number>>(() =>
    buildReturnedDraft(row.issuedItems),
  );
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnedItems = useMemo(
    () =>
      row.issuedItems.map((line) => ({
        item: line.item,
        qty: Math.max(0, Math.floor(Number(returnedByItem[line.item] ?? 0))),
      })),
    [row.issuedItems, returnedByItem],
  );

  const preview = useMemo(
    () => mergeReturnedAgainstIssued(row.issuedItems, returnedItems),
    [row.issuedItems, returnedItems],
  );

  const confirm = async () => {
    if (isDemo) {
      setError('Preview mode — run migrations first.');
      return;
    }
    const name = row.fullName || row.guardEpf;
    const shortfallNote = preview.allReturned
      ? 'All issued items marked as returned.'
      : `${preview.shortfallLines.length} item line(s) not fully returned — confirm anyway?`;
    if (
      !window.confirm(
        `Confirm uniform collection for ${name} (${row.guardEpf})?\n\n${shortfallNote}`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await confirmUniformCollection({
      caseId: row.caseId,
      returnedItems,
      adminNotes: notes,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Confirmation failed');
      return;
    }
    onConfirmed();
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
            Awaiting collection
          </p>
          <p className="mt-1 text-sm font-bold text-slate-900">{row.fullName}</p>
          <p className="text-xs text-slate-600">
            <span className="font-mono font-bold text-violet-700">{row.guardEpf}</span>
            {row.rank ? <span> · {row.rank}</span> : null}
          </p>
          <p className="mt-1 font-mono text-xs font-bold text-slate-500">
            Requested {formatWhen(row.requestedAt)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                Item
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">
                Issued
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">
                Returned
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {row.issuedItems.map((line) => (
              <tr key={`${row.caseId}-${line.item}`}>
                <td className="px-4 py-2 font-semibold text-slate-800">{line.item}</td>
                <td className="px-4 py-2 text-right font-mono font-black text-slate-600">
                  {line.qty}
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={line.qty}
                    value={returnedByItem[line.item] ?? 0}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const next = Number.isFinite(raw)
                        ? Math.min(line.qty, Math.max(0, Math.floor(raw)))
                        : 0;
                      setReturnedByItem((prev) => ({ ...prev, [line.item]: next }));
                    }}
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right font-mono text-sm font-bold text-slate-900"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!preview.allReturned ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p>Shortfall if confirmed now:</p>
            <ul className="mt-1 list-disc pl-4 normal-case font-semibold">
              {preview.shortfallLines.map((line) => (
                <li key={line.item}>
                  {line.item} — {line.qty} not returned
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          Admin notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Condition notes, partial return reason…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case"
          />
        </label>
        {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-emerald-600/20 disabled:opacity-50 sm:w-auto"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Confirm collection
        </button>
      </div>
    </article>
  );
}

function CollectionConfirmedCard({ row }: { row: UniformCollectionQueueRow }) {
  const mergeResult = useMemo(
    () => mergeReturnedAgainstIssued(row.issuedItems, row.returnedItems),
    [row.issuedItems, row.returnedItems],
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
          Collected
        </p>
        <p className="mt-1 text-sm font-bold text-slate-900">{row.fullName}</p>
        <p className="text-xs text-slate-600">
          <span className="font-mono font-bold text-violet-700">{row.guardEpf}</span>
          {row.rank ? <span> · {row.rank}</span> : null}
        </p>
        <p className="mt-1 text-xs font-bold text-emerald-800">
          Confirmed {row.confirmedAt ? formatWhen(row.confirmedAt) : '—'}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                Item
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">
                Issued
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">
                Returned
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {row.issuedItems.map((line) => {
              const returned =
                row.returnedItems.find((r) => r.item === line.item)?.qty ?? 0;
              const short = returned < line.qty;
              return (
                <tr key={`${row.caseId}-${line.item}`}>
                  <td className="px-4 py-2 font-semibold text-slate-800">{line.item}</td>
                  <td className="px-4 py-2 text-right font-mono font-black text-slate-600">
                    {line.qty}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-mono font-black ${
                      short ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {returned}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!mergeResult.allReturned ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p>Not all items returned:</p>
            <ul className="mt-1 list-disc pl-4 normal-case font-semibold">
              {mergeResult.shortfallLines.map((line) => (
                <li key={line.item}>
                  {line.item} — {line.qty} short
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          All issued items returned
        </div>
      )}

      {row.adminNotes ? (
        <p className="text-xs text-slate-600">
          <span className="font-black uppercase tracking-wider text-slate-500">Notes: </span>
          {row.adminNotes}
        </p>
      ) : null}
    </article>
  );
}

export default function UniformCollectingWorkbench({
  initial,
}: {
  initial: UniformCollectionQueueOverview;
}) {
  const { monthInput, payrollMonthLabel } = useDeductionsPayrollMonth();
  const [overview, setOverview] = useState(initial);
  const [tab, setTab] = useState<'pending' | 'confirmed'>('pending');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (month?: string) => {
    setRefreshing(true);
    const next = await getUniformCollectionQueue(month ?? monthInput);
    setOverview(next);
    setRefreshing(false);
  }, [monthInput]);

  useEffect(() => {
    void refresh(monthInput);
  }, [monthInput, refresh]);

  const list = tab === 'pending' ? overview.pending : overview.confirmed;
  const emptyLabel = useMemo(
    () =>
      tab === 'pending'
        ? `No collection requests in ${payrollMonthLabel}.`
        : `No collections confirmed in ${payrollMonthLabel}.`,
    [payrollMonthLabel, tab],
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50">
            <RotateCcw className="h-5 w-5 text-indigo-700" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900">
              Uniform collecting
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              HR requests collection from MNR offboarding. Record returned quantities against the
              issued snapshot — HR can confirm resignation once you confirm collection here.
            </p>
            <p className="mt-2 text-xs font-semibold text-indigo-700">
              Showing {payrollMonthLabel}
              {tab === 'pending' ? ' · requested this month' : ' · confirmed this month'}
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

      {overview.isDemo ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Uniform collection table is not migrated. Apply the{' '}
          <code className="text-xs">uniform_collection_cases</code> migration, then refresh.
        </p>
      ) : null}

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
          onClick={() => setTab('confirmed')}
          className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
            tab === 'confirmed'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Confirmed ({overview.confirmed.length})
        </button>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center text-sm font-semibold text-slate-500">
          {emptyLabel}
          {tab === 'pending' ? (
            <span className="mt-2 block text-xs font-medium text-slate-400">
              HR creates requests from MNR offboarding clearance. Try another month above.
            </span>
          ) : null}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tab === 'pending'
            ? overview.pending.map((row) => (
                <CollectionPendingCard
                  key={row.caseId}
                  row={row}
                  isDemo={overview.isDemo}
                  onConfirmed={() => void refresh()}
                />
              ))
            : overview.confirmed.map((row) => (
                <CollectionConfirmedCard key={row.caseId} row={row} />
              ))}
        </div>
      )}
    </div>
  );
}
