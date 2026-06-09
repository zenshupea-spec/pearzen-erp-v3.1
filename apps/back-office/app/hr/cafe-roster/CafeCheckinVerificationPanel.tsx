'use client';

import { useState, useTransition } from 'react';
import { Check, Flag, Loader2 } from 'lucide-react';

import {
  getCafeRosterDeskData,
  reviewCafeCheckinVerification,
  type CafeCheckinVerificationRow,
} from './actions';

export default function CafeCheckinVerificationPanel({
  initialRows,
}: {
  initialRows: CafeCheckinVerificationRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = () => {
    startTransition(async () => {
      const data = await getCafeRosterDeskData();
      setRows(data.pendingCheckinVerifications);
    });
  };

  const handleReview = (checkinId: string, decision: 'APPROVED' | 'FLAGGED') => {
    setError(null);
    startTransition(async () => {
      const result = await reviewCafeCheckinVerification({ checkinId, decision });
      if (!result.ok) {
        setError(result.error ?? 'Failed to review check-in.');
        return;
      }
      reload();
    });
  };

  if (!rows.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/70 shadow-sm">
      <div className="border-b border-sky-200/80 px-5 py-3">
        <h2 className="text-sm font-black uppercase tracking-tight text-sky-900">
          Pending shift check-in verifications
        </h2>
        <p className="mt-1 text-xs font-semibold text-sky-800">
          Café Front GPS + selfie check-ins awaiting HR review — same flow as TM guard verification.
        </p>
      </div>

      {error ? (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="divide-y divide-sky-100">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-4 bg-white/70 px-5 py-4"
          >
            <div className="flex min-w-0 flex-1 items-start gap-4">
              {row.selfieUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.selfieUrl}
                  alt={`${row.employeeName} check-in selfie`}
                  className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-[10px] font-bold uppercase text-slate-400">
                  No photo
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  {row.employeeName}{' '}
                  <span className="font-mono text-xs text-slate-500">· {row.employeeEpf}</span>
                </p>
                <p className="mt-1 text-xs font-medium text-slate-600">
                  {row.checkinDate} · checked in{' '}
                  {row.checkedInAt
                    ? new Date(row.checkedInAt).toLocaleTimeString('en-LK', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {row.rosteredOnShift ? 'Rostered shift' : 'Unrostered · ad-hoc site check-in'}
                  {row.latitude != null && row.longitude != null
                    ? ` · GPS ${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleReview(row.id, 'APPROVED')}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleReview(row.id, 'FLAGGED')}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                <Flag className="h-3.5 w-3.5" />
                Flag
              </button>
            </div>
          </div>
        ))}
      </div>

      {isPending ? (
        <div className="flex items-center justify-center gap-2 border-t border-sky-100 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-sky-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Updating…
        </div>
      ) : null}
    </section>
  );
}
