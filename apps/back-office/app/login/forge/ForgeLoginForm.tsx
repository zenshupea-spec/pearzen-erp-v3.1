'use client';

import { useEffect, useState, useTransition } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { authenticateForgeOperator } from './actions';

type Props = {
  disabled?: boolean;
  email?: string;
  emailReadOnly?: boolean;
};

export default function ForgeLoginForm({
  disabled = false,
  email: initialEmail = '',
  emailReadOnly = false,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    setErrorMsg('');

    startTransition(async () => {
      const result = await authenticateForgeOperator({ email, password });
      if (result?.error) {
        setErrorMsg(result.error);
      }
    });
  };

  const fieldClassName = disabled
    ? 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-400 shadow-sm'
    : 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {disabled ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs text-slate-500">
          Complete Google sign-in above to unlock operator credentials.
        </p>
      ) : null}

      {errorMsg ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
          {errorMsg}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Operator email
        </label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          readOnly={emailReadOnly}
          disabled={disabled}
          className={fieldClassName}
          placeholder="you@company.com"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={disabled}
            className={`${fieldClassName} pr-10`}
            placeholder="••••••••••••"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-40"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending || disabled}
        className="w-full rounded-xl bg-indigo-700 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-700/25 transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Verifying…' : 'Continue with password'}
      </button>
      <p className="text-center text-xs text-slate-500">
        <a
          href="/login/forge/forgot-password"
          className={`text-indigo-600 hover:underline ${disabled ? 'pointer-events-none opacity-40' : ''}`}
          tabIndex={disabled ? -1 : undefined}
        >
          Forgot password?
        </a>
      </p>
    </form>
  );
}
