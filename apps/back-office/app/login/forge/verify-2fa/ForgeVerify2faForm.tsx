'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { isForgeBackupCodeInput } from '../../../../lib/forge-portal-backup-shared';
import { verifyForgeTotpAction } from './actions';

export default function ForgeVerify2faForm() {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (useBackup) {
      if (!isForgeBackupCodeInput(code)) {
        setErrorMsg('Enter a 20-digit backup key.');
        return;
      }
    } else if (code.length !== 6) {
      setErrorMsg('Enter the 6-digit authenticator code.');
      return;
    }
    startTransition(async () => {
      const result = await verifyForgeTotpAction(code);
      if (result?.error) setErrorMsg(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMsg ? (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
          {errorMsg}
        </p>
      ) : null}
      <input
        inputMode="numeric"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, useBackup ? 20 : 6))}
        placeholder={useBackup ? '20-digit backup key' : '6-digit code'}
        className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-center font-mono text-lg tracking-widest text-white"
      />
      <button
        type="button"
        onClick={() => {
          setUseBackup((value) => !value);
          setCode('');
        }}
        className="text-xs text-indigo-300 hover:underline"
      >
        {useBackup ? 'Use authenticator code' : 'Use backup key instead'}
      </button>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
      >
        {isPending ? 'Verifying…' : 'Verify'}
      </button>
      <p className="text-center text-xs text-slate-500">
        <Link href="/login/forge/recover-2fa" className="text-indigo-300 hover:underline">
          Lost 2FA access?
        </Link>
      </p>
    </form>
  );
}
