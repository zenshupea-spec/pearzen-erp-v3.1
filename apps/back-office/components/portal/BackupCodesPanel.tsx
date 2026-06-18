'use client';

import { AlertTriangle, Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';

import { formatHeadOfficeBackupCode } from '../../lib/head-office-totp-backup-client';

type BackupCodesPanelProps = {
  codes: string[];
  onContinue?: () => void;
  continueLabel?: string;
  title?: string;
};

export default function BackupCodesPanel({
  codes,
  onContinue,
  continueLabel = "I've saved these codes",
  title = 'Save your backup codes',
}: BackupCodesPanelProps) {
  const [copied, setCopied] = useState(false);

  const formattedCodes = codes.map((code) => formatHeadOfficeBackupCode(code));
  const copyText = formattedCodes.join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="space-y-2">
          <p className="text-sm font-black uppercase tracking-wider text-amber-900">{title}</p>
          <p className="text-sm text-amber-900">
            Store these 5 one-time codes somewhere safe. Each code works once if your authenticator
            app is unavailable, including when replacing or removing 2FA.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {formattedCodes.map((code) => (
          <div
            key={code}
            className="rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-sm font-bold tracking-widest text-slate-800"
          >
            {code}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-amber-900 hover:bg-amber-100"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy all'}
        </button>
        {onContinue ? (
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-500"
          >
            {continueLabel}
          </button>
        ) : null}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-white/70 px-3 py-2.5 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>
          These codes are shown only once. If you lose them, replace your authenticator from
          account security while you still have access.
        </span>
      </div>
    </div>
  );
}
