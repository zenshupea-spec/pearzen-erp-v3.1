'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Eye, EyeOff, Radio } from 'lucide-react';

export default function SMLoginForm({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    const form = e.currentTarget;
    const epfNumber = (form.elements.namedItem('epfNumber') as HTMLInputElement).value.toUpperCase().trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value.trim();

    startTransition(async () => {
      try {
        const res = await fetch('/api/auth/sm-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ epfNumber, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          setErrorMsg(data.error || 'Login failed. Check your credentials.');
          return;
        }

        if (data.needsPinSetup) {
          router.replace('/set-pin');
        } else {
          router.replace('/dashboard');
        }
      } catch {
        setErrorMsg('Network error. Please try again.');
      }
    });
  };

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-1 flex-col justify-center p-6">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="space-y-4 text-center">
          <div className="mb-2 flex justify-center">
            <div className="relative">
              <div
                className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl ${
                  logoUrl
                    ? 'border border-slate-200 bg-white shadow-lg shadow-slate-900/10'
                    : 'border border-slate-700/20 bg-gradient-to-br from-slate-800 to-slate-900 shadow-lg shadow-slate-900/30'
                }`}
              >
                {logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <Shield className="h-10 w-10 text-slate-100" strokeWidth={1.75} />
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-50 bg-amber-500 shadow-sm">
                <Radio className="h-3 w-3 text-white" strokeWidth={2.5} />
              </span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">
              Classic Venture Security
            </p>
            <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900">
              SM Portal
            </h1>
            <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Sector Manager · Restricted
            </p>
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
              EPF Number
            </label>
            <input
              type="text"
              name="epfNumber"
              placeholder="e.g. SM-001"
              required
              autoCapitalize="characters"
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-xl font-bold uppercase text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
              Password / OTP
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="6-digit PIN or OTP"
                required
                inputMode="numeric"
                maxLength={6}
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 pr-12 text-center font-mono text-2xl font-black tracking-[0.5em] text-slate-900 shadow-inner transition-all placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-900/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 w-full rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            {isPending ? 'Verifying…' : 'Access portal'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-[10px] font-mono text-slate-400">
            Forgot your PIN? Contact HR to issue a new OTP.
          </p>
        </div>
      </div>
    </div>
  );
}
