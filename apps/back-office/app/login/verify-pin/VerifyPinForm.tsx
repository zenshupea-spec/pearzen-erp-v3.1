'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, Shield } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import {
  HO_PORTAL_PIN_LENGTH,
} from '../../../lib/head-office-portal-auth';
import { verifyHeadOfficePinAction } from './actions';

export default function VerifyPinForm({
  logoUrl,
  companyName,
  needsSetup,
  authError,
}: {
  logoUrl: string | null;
  companyName?: string | null;
  needsSetup: boolean;
  authError?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState(authError ?? '');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (code.length !== HO_PORTAL_PIN_LENGTH) {
      setErrorMsg(`Enter all ${HO_PORTAL_PIN_LENGTH} digits.`);
      return;
    }
    startTransition(async () => {
      const result = await verifyHeadOfficePinAction(code);
      if (result?.error) setErrorMsg(result.error);
    });
  };

  const displayCompanyName = companyName?.trim() || 'Classic Venture Security';

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-white text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <main className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-full w-full object-contain p-2" />
                ) : (
                  <Shield className="h-10 w-10 text-slate-700" strokeWidth={1.75} />
                )}
              </div>
            </div>
            <div>
              <p className="font-university-roman text-xl uppercase tracking-[0.12em] text-rose-900 sm:text-2xl">
                {displayCompanyName}
              </p>
              <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-slate-900 sm:text-4xl">
                Pearzen ERP
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                {needsSetup ? 'Enter your one-time password' : 'Enter your portal PIN'}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm backdrop-blur-md"
          >
            {errorMsg ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                {errorMsg}
              </div>
            ) : null}

            <p className="text-center text-xs text-slate-500">
              {needsSetup
                ? 'Use the OTP from your Managing Director to continue, then choose your own PIN.'
                : 'Enter the 6-digit PIN you set on first login.'}
            </p>

            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, HO_PORTAL_PIN_LENGTH))
                }
                inputMode="numeric"
                maxLength={HO_PORTAL_PIN_LENGTH}
                autoComplete="one-time-code"
                placeholder={needsSetup ? '6-digit OTP' : '6-digit PIN'}
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 pr-12 text-center font-mono text-2xl font-black tracking-[0.5em] text-slate-900 shadow-inner transition-all placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
              />
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
              >
                {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={isPending || code.length !== HO_PORTAL_PIN_LENGTH}
              className="w-full rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? 'Verifying…' : 'Continue'}
            </button>
          </form>

          <p className="text-center text-[10px] font-mono text-slate-400">
            Forgot your PIN? Ask MD to issue a new OTP or reset access.
          </p>
        </div>
      </main>
    </div>
  );
}
