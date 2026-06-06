'use client';

import { useState, useTransition } from 'react';
import { Ban, ShieldCheck, UserX } from 'lucide-react';
import { approveBlacklistRemoval, type BlacklistedGuardEntry } from './actions';
import { CardBlacklistStrike } from './CardBlacklistStrike';

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BlacklistedScorecard({
  entry,
  canApproveRemoval,
  isDemo,
  notes,
  onNotesChange,
  onApproveRemoval,
  pending,
}: {
  entry: BlacklistedGuardEntry;
  canApproveRemoval: boolean;
  isDemo: boolean;
  notes: string;
  onNotesChange: (v: string) => void;
  onApproveRemoval: () => void;
  pending: boolean;
}) {
  return (
    <li className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/80">
      <CardBlacklistStrike />
      <div className="relative opacity-50">
        <div className="flex gap-3 border-b border-slate-100 p-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-rose-50 ring-2 ring-rose-200">
            <UserX className="h-6 w-6 text-rose-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-rose-800">
                Blacklisted
              </span>
              <Ban className="h-4 w-4 shrink-0 text-rose-600" />
            </div>
            <p className="mt-1 truncate text-sm font-black leading-tight text-slate-900">
              {entry.guardName ?? entry.empNumber}
            </p>
            <p className="truncate text-[10px] font-semibold text-slate-500">
              {entry.guardRank ?? '—'} · <span className="font-mono">{entry.empNumber}</span>
            </p>
          </div>
        </div>

        <div className="space-y-2 px-3 py-2.5">
          <p className="text-[11px] leading-snug text-slate-700">
            <span className="font-bold uppercase tracking-wide text-slate-500">Reason · </span>
            {entry.reason ?? '—'}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            By {entry.blacklistedByName} · {formatWhen(entry.blacklistedAt)}
          </p>
        </div>
      </div>

      {canApproveRemoval && (
        <div className="relative z-20 border-t border-slate-100 bg-slate-50/80 px-3 py-2.5">
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            MD removal notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800"
            placeholder="Reason for release from blacklist…"
          />
          <button
            type="button"
            disabled={pending}
            onClick={onApproveRemoval}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <ShieldCheck className="h-3 w-3" />
            {pending ? 'Approving…' : 'MD approve removal'}
          </button>
        </div>
      )}
      {isDemo && (
        <p className="relative border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-center text-[8px] font-bold uppercase tracking-wider text-slate-400">
          Preview entry
        </p>
      )}
    </li>
  );
}

export default function BlacklistedPanel({
  initialEntries,
  canApproveRemoval,
  isDemo = false,
}: {
  initialEntries: BlacklistedGuardEntry[];
  canApproveRemoval: boolean;
  isDemo?: boolean;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [pending, startTransition] = useTransition();
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const handleRemove = (entryId: string) => {
    if (isDemo || entryId.startsWith('demo-')) {
      alert('Preview mode — MD removal is disabled for demo entries.');
      return;
    }
    if (!canApproveRemoval) return;
    const notes = notesById[entryId] ?? '';
    if (
      !confirm(
        'MD approval will permanently release this guard from the blacklist. Continue?',
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await approveBlacklistRemoval(entryId, notes);
      if ('error' in res && res.error) {
        alert(res.error);
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    });
  };

  return (
    <div className="space-y-4">
      {!canApproveRemoval && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Permanent hold</p>
          <p className="mt-1 text-xs text-amber-800">
            Guards stay blacklisted until the Managing Director or Operations Director approves
            removal. OM cannot release them from here.
          </p>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No blacklisted guards.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {entries.map((entry) => (
            <BlacklistedScorecard
              key={entry.id}
              entry={entry}
              canApproveRemoval={canApproveRemoval}
              isDemo={isDemo}
              notes={notesById[entry.id] ?? ''}
              onNotesChange={(v) =>
                setNotesById((prev) => ({ ...prev, [entry.id]: v }))
              }
              onApproveRemoval={() => handleRemove(entry.id)}
              pending={pending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
