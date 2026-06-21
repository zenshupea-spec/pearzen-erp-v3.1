'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { verifyForgePinAction } from './actions';

export default function ForgeVerifyPinForm() {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    startTransition(async () => {
      const result = await verifyForgePinAction(password);
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
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Login password"
          className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 pr-10 text-sm text-white"
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-indigo-600 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
      >
        {isPending ? 'Verifying…' : 'Continue'}
      </button>
    </form>
  );
}
