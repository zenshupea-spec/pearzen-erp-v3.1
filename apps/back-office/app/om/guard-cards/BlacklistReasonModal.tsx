'use client';

import { useEffect, useState } from 'react';
import { Ban, X } from 'lucide-react';

export default function BlacklistReasonModal({
  open,
  guardName,
  empNumber,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  guardName: string;
  empNumber: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open, guardName]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" aria-hidden />
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="blacklist-modal-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                <Ban className="h-4 w-4" />
              </div>
              <p
                id="blacklist-modal-title"
                className="text-sm font-black uppercase tracking-tight text-slate-900"
              >
                Blacklist guard
              </p>
            </div>
            <p className="truncate text-xs font-semibold text-slate-600">{guardName}</p>
            <p className="font-mono text-[10px] text-slate-400">EPF {empNumber}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Reason for blacklist
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this guard is being blacklisted…"
              rows={4}
              autoFocus
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-slate-500">
            The guard will be removed from the performance board and listed under Blacklisted until MD
            approves removal.
          </p>
        </div>

        <div className="flex gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Confirm blacklist'}
          </button>
        </div>
      </div>
    </div>
  );
}
