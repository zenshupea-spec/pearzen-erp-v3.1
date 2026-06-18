'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Eye, EyeOff } from 'lucide-react';

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
          credentials: 'same-origin',
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
    <div className="flex-1 flex flex-col justify-center p-6 min-h-[100dvh]">
      <div className="w-full max-w-sm mx-auto space-y-8">

        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div
                className={`h-20 w-20 rounded-2xl flex items-center justify-center overflow-hidden ${
                  logoUrl
                    ? 'border border-stone-200 bg-white shadow-[0_0_40px_rgba(245,158,11,0.15)]'
                    : 'bg-amber-500/10 border border-amber-500/30 shadow-[0_0_40px_rgba(245,158,11,0.2)]'
                }`}
              >
                {logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={logoUrl}
                    alt="Company logo"
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <Shield className="w-10 h-10 text-amber-400" />
                )}
              </div>
              <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)] animate-pulse" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-stone-100 uppercase tracking-tighter">
            SM Portal
          </h1>
          <p className="text-sm text-amber-400/70 font-mono font-bold uppercase tracking-widest">
            Sector Manager · Restricted
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4 bg-stone-800/60 backdrop-blur-md p-6 rounded-3xl border border-stone-700/60 shadow-[0_8px_40px_rgba(0,0,0,0.4)]">

          {/* EPF Number */}
          <div>
            <label className="block text-sm font-black text-stone-400 mb-2 uppercase tracking-widest">
              EPF Number
            </label>
            <input
              type="text"
              name="epfNumber"
              placeholder="e.g. SM-001"
              required
              autoCapitalize="characters"
              className="w-full bg-stone-900 border-2 border-stone-700 text-stone-100 px-4 py-4 rounded-xl text-center font-mono text-xl uppercase font-bold focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-stone-600 shadow-inner"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-black text-stone-400 mb-2 uppercase tracking-widest">
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
                className="w-full bg-stone-900 border-2 border-stone-700 text-stone-100 px-4 py-4 pr-12 rounded-xl text-center font-mono text-2xl font-black tracking-[0.5em] focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-stone-600 placeholder:text-base placeholder:tracking-normal shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 hover:text-amber-400 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm text-center font-bold">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-stone-900 font-black text-lg py-4 rounded-xl uppercase tracking-widest shadow-[0_8px_20px_rgba(245,158,11,0.3)] transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 mt-2"
          >
            {isPending ? 'VERIFYING...' : 'ACCESS PORTAL'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-stone-600 font-mono font-bold">
            Forgot your PIN? Contact HR to issue a new OTP.
          </p>
        </div>
      </div>
    </div>
  );
}
