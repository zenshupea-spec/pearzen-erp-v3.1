'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';

import { resetHeadOfficeUnlockCodeAction } from '../../actions/portal-session-actions';

export default function ResetUnlockCodeForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (code.length !== 6 || code !== confirm) {
      setErrorMsg('Enter matching 6-digit codes.');
      return;
    }
    startTransition(async () => {
      const result = await resetHeadOfficeUnlockCodeAction(password, code);
      if (result?.error) {
        setErrorMsg(result.error);
        return;
      }
      router.back();
      router.refresh();
    });
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-indigo-600" />
          <h1 className="text-lg font-black text-slate-900">Reset unlock code</h1>
        </div>
        <p className="text-sm text-slate-600">
          Enter your login password, then choose a new 6-digit unlock code.
        </p>
        {errorMsg ? (
          <p className="mt-3 text-xs font-bold text-rose-700">{errorMsg}</p>
        ) : null}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Login password"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            required
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="New 6-digit code"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono tracking-widest"
            required
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Confirm code"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono tracking-widest"
            required
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save new unlock code'}
          </button>
        </form>
      </div>
    </div>
  );
}
