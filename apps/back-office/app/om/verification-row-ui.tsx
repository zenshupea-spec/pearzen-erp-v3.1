'use client';

import { Check, ImageOff, Pause, X } from 'lucide-react';

export function InlinePhoto({
  label,
  url,
  time,
  accent = 'slate',
  emptyLabel,
  purged,
  onClick,
}: {
  label: string;
  url: string | null | undefined;
  time?: string | null;
  accent?: 'slate' | 'emerald' | 'rose' | 'indigo';
  emptyLabel: string;
  purged?: boolean;
  onClick?: () => void;
}) {
  const borderClass =
    accent === 'emerald'
      ? 'border-emerald-200 hover:border-emerald-300'
      : accent === 'rose'
        ? 'border-rose-200 hover:border-rose-300'
        : accent === 'indigo'
          ? 'border-indigo-200 hover:border-indigo-300'
          : 'border-slate-200 hover:border-slate-300';

  const timeClass =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'rose'
        ? 'text-rose-700'
        : accent === 'indigo'
          ? 'text-indigo-700'
          : 'text-slate-600';

  return (
    <div className="shrink-0 space-y-1">
      <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <button
        type="button"
        disabled={!url}
        onClick={onClick}
        className={`relative h-[6.5rem] w-[5.25rem] overflow-hidden rounded-lg border bg-slate-50 transition-all sm:h-[9rem] sm:w-[7.2rem] ${
          url ? 'cursor-zoom-in hover:shadow-sm' : 'cursor-default'
        } ${borderClass}`}
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center px-1.5 text-center">
            {purged ? <ImageOff className="h-4 w-4 text-slate-300" /> : null}
            <span className="text-[8px] font-bold uppercase leading-tight tracking-wide text-slate-400">
              {purged ? 'Purged' : emptyLabel}
            </span>
          </div>
        )}
      </button>
      <p className={`w-[5.25rem] text-center font-mono text-[9px] font-semibold sm:w-[7.2rem] sm:text-[10px] ${timeClass}`}>
        {time ?? '—'}
      </p>
    </div>
  );
}

export function PhotoLightbox({
  label,
  url,
  onClose,
}: {
  label: string;
  url: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3">
          <p className="text-sm font-black text-slate-900">{label}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <img src={url} alt={label} className="max-h-[calc(90vh-4rem)] w-full object-contain" />
      </div>
    </div>
  );
}

export function VerificationActionButtons({
  verifying,
  onReject,
  onHold,
  onApprove,
  showReject = true,
}: {
  verifying: boolean;
  onReject?: () => void;
  onHold: () => void;
  onApprove: () => void;
  showReject?: boolean;
}) {
  const circleBtn =
    'flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition-all hover:scale-105 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:h-11 sm:w-11';

  return (
    <div className="flex shrink-0 items-center justify-center gap-1.5 sm:ml-auto sm:gap-2">
      {showReject && onReject && (
        <button
          type="button"
          disabled={verifying}
          onClick={onReject}
          title="Reject"
          aria-label="Reject"
          className={`${circleBtn} bg-rose-700 hover:bg-rose-800`}
        >
          <X className="h-5 w-5 stroke-[2.5]" />
        </button>
      )}
      <button
        type="button"
        disabled={verifying}
        onClick={onHold}
        title="Hold"
        aria-label="Hold"
        className={`${circleBtn} bg-amber-700 hover:bg-amber-800`}
      >
        <Pause className="h-5 w-5 fill-current stroke-[2.5]" />
      </button>
      <button
        type="button"
        disabled={verifying}
        onClick={onApprove}
        title="Approve"
        aria-label="Approve"
        className={`${circleBtn} bg-indigo-800 hover:bg-indigo-900`}
      >
        {verifying ? (
          <span className="text-sm font-black">…</span>
        ) : (
          <Check className="h-5 w-5 stroke-[2.5]" />
        )}
      </button>
    </div>
  );
}
