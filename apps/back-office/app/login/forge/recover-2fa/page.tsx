'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { requestForge2faRecoveryAction } from '../../../actions/forge-session-actions';

export default function ForgeRecover2faPage() {
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    startTransition(async () => {
      const result = await requestForge2faRecoveryAction(email);
      if ('error' in result && result.error) {
        setErrorMsg(result.error);
        return;
      }
      setSuccessMsg('Recovery email sent. Sign in and complete 2FA setup again.');
    });
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-black uppercase tracking-tight">2FA recovery</h1>
          <p className="mt-2 text-sm text-slate-400">
            Available after the 120-hour cooldown that follows backup-key use.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          {errorMsg ? <p className="text-xs font-bold text-rose-300">{errorMsg}</p> : null}
          {successMsg ? (
            <p className="text-xs font-bold text-emerald-300">{successMsg}</p>
          ) : null}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Operator email"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white"
            required
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
          >
            {isPending ? 'Requesting…' : 'Request email recovery'}
          </button>
        </form>
        <p className="text-center text-xs text-slate-500">
          <Link href="/login/forge/verify-2fa" className="text-indigo-300 hover:underline">
            Back to 2FA
          </Link>
        </p>
      </div>
    </div>
  );
}
