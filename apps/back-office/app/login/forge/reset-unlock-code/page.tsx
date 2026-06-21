'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { resetForgeUnlockCodeAction } from '../../../actions/forge-session-actions';

export default function ForgeResetUnlockCodePage() {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (code.length !== 6 || confirm.length !== 6) {
      setErrorMsg('Unlock code must be 6 digits.');
      return;
    }
    if (code !== confirm) {
      setErrorMsg('Codes do not match.');
      return;
    }
    startTransition(async () => {
      const result = await resetForgeUnlockCodeAction(password, code);
      if (result?.error) {
        setErrorMsg(result.error);
        return;
      }
      setSuccess(true);
    });
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-center text-2xl font-black uppercase">Reset unlock code</h1>
        {success ? (
          <p className="text-center text-sm text-emerald-300">
            Unlock code updated.{' '}
            <Link href="/forge" className="underline">
              Return to Forge
            </Link>
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
            {errorMsg ? <p className="text-xs font-bold text-rose-300">{errorMsg}</p> : null}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Login password"
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white"
              required
            />
            <input
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="New 6-digit code"
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-center font-mono text-white"
            />
            <input
              inputMode="numeric"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Confirm code"
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-center font-mono text-white"
            />
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
            >
              {isPending ? 'Saving…' : 'Save new code'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
