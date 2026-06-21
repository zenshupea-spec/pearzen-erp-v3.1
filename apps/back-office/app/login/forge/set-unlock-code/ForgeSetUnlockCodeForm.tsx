'use client';

import { useState, useTransition } from 'react';

import { saveForgeUnlockCodeAction } from '../../../actions/forge-session-actions';

export default function ForgeSetUnlockCodeForm() {
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (code.length !== 6 || confirm.length !== 6) {
      setErrorMsg('Unlock code must be exactly 6 digits.');
      return;
    }
    if (code !== confirm) {
      setErrorMsg('Codes do not match.');
      return;
    }
    startTransition(async () => {
      const result = await saveForgeUnlockCodeAction(code);
      if (result?.error) setErrorMsg(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-300">
        Used when Forge auto-locks after <strong>15 minutes</strong> idle.
      </p>
      {errorMsg ? (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
          {errorMsg}
        </p>
      ) : null}
      <input
        inputMode="numeric"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="6-digit unlock code"
        className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-center font-mono text-lg text-white"
      />
      <input
        inputMode="numeric"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="Confirm unlock code"
        className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-center font-mono text-lg text-white"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
      >
        {isPending ? 'Saving…' : 'Save & enter Forge'}
      </button>
    </form>
  );
}
