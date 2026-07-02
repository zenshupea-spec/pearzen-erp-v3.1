'use client';

import { AlertTriangle, Loader2, X } from 'lucide-react';

import { WEB_EDITOR_TAB_META, type BulkEditorTabId } from '../../lib/bulk-roster-web-editor-spec';

export type BulkEditorApplyModalProps = {
  open: boolean;
  applying: boolean;
  totpCode: string;
  confirmError: string | null;
  dirtyTabIds: readonly BulkEditorTabId[];
  onTotpChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export default function BulkEditorApplyModal({
  open,
  applying,
  totpCode,
  confirmError,
  dirtyTabIds,
  onTotpChange,
  onClose,
  onConfirm,
}: BulkEditorApplyModalProps) {
  if (!open) return null;

  const dirtyLabels = dirtyTabIds.map((tabId) => WEB_EDITOR_TAB_META[tabId].label);

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-editor-apply-title"
        className="mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/30 ring-1 ring-slate-900/[0.05]"
      >
        <div className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <div className="min-w-0">
            <h2
              id="bulk-editor-apply-title"
              className="text-base font-black uppercase tracking-widest text-slate-900"
            >
              Apply roster changes
            </h2>
            <p className="text-sm font-medium text-slate-600">Merge-on-update into live Pearzen data</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Cancel apply"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {dirtyLabels.length > 0 ? (
            <p className="text-xs font-semibold text-slate-600">
              Edited sheets:{' '}
              <span className="font-bold text-slate-800">{dirtyLabels.join(', ')}</span>
            </p>
          ) : null}

          <ul className="space-y-2 text-sm font-semibold leading-relaxed text-slate-700">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              Will merge into existing records matched by emp number or employee ID.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              Will <strong>not</strong> delete staff missing from the editor grids.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              Blank cells will <strong>not</strong> erase existing MNR fields.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              Sites and rank matrix changes (if edited) save before employee rows.
            </li>
          </ul>

          <p className="text-xs font-medium text-slate-500">
            Use MNR for routine edits after go-live. This action requires your authenticator app.
          </p>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Authenticator code (required)
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={totpCode}
              onChange={(event) => {
                onTotpChange(event.target.value.replace(/\D/g, '').slice(0, 6));
              }}
              placeholder="000000"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-black tracking-[0.45em] text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </label>

          {confirmError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
              {confirmError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={applying || totpCode.length !== 6}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-rose-600/25 hover:bg-rose-500 disabled:opacity-50"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Apply changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
