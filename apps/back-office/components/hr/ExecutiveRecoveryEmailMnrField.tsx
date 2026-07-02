'use client';

import { useEffect, useState } from 'react';

import { getExecutiveRecoveryEmailForMnr } from '../../app/hr/mnr/actions';
import { maskRecoveryEmail } from '../../lib/head-office-portal-recovery-email';

export default function ExecutiveRecoveryEmailMnrField({
  employeeId,
  editing,
  inputClass,
}: {
  employeeId: string;
  editing: boolean;
  inputClass: string;
}) {
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError(null);
      const result = await getExecutiveRecoveryEmailForMnr(employeeId);
      if (cancelled) return;
      if ('error' in result) {
        setRecoveryEmail(null);
        setLoadError(result.error);
        return;
      }
      setRecoveryEmail(result.recoveryEmail);
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  if (!editing) {
    return (
      <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
          Recovery email
        </span>
        <p className="text-sm font-bold text-slate-900">
          {recoveryEmail ? maskRecoveryEmail(recoveryEmail) : 'Not set'}
        </p>
        <p className="text-[10px] text-slate-500 font-semibold">
          Personal inbox for MD/OD portal recovery. OTP is issued from MD Portal → Security &amp;
          Access → Staff Command Center.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
        Recovery email (optional)
      </label>
      <input
        type="email"
        name="recovery_email"
        defaultValue={recoveryEmail ?? ''}
        placeholder="personal@gmail.com"
        className={inputClass}
      />
      <p className="text-[10px] text-amber-800 font-bold">
        Must differ from work email. Required before OTP can be issued from MD Portal → Security
        &amp; Access → Staff Command Center.
      </p>
      {recoveryEmail ? (
        <p className="text-[10px] text-slate-500">
          On file: <span className="font-mono">{maskRecoveryEmail(recoveryEmail)}</span>
        </p>
      ) : null}
      {loadError ? (
        <p className="text-[10px] font-bold text-rose-700">{loadError}</p>
      ) : null}
    </div>
  );
}
