'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, Shield } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import {
  HO_PORTAL_OTP_LENGTH,
  validateHeadOfficePortalPassword,
} from '../../../lib/head-office-portal-password';
import {
  executivePortalPasswordHint,
  passwordMinLengthForRank,
} from '../../../lib/executive-portal-auth-policy';
import { setHeadOfficePinAction } from './actions';

export default function SetHeadOfficePinForm({
  logoUrl,
  companyName,
  portalRole,
  rbacGated,
}: {
  logoUrl: string | null;
  companyName?: string | null;
  portalRole?: string | null;
  rbacGated?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');

  const displayCompanyName = companyName?.trim() || 'Classic Venture Security';
  const passwordMinLength = passwordMinLengthForRank(portalRole, { rbacGated });
  const passwordHint = executivePortalPasswordHint(portalRole, { rbacGated });

  const handleChoose = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    const check = validateHeadOfficePortalPassword(password, {
      minLength: passwordMinLength,
    });
    if (!check.ok) {
      setErrorMsg(check.error);
      return;
    }
    setStep('confirm');
  };

  const handleConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    startTransition(async () => {
      const result = await setHeadOfficePinAction(password, confirmPassword);
      if (result?.error) setErrorMsg(result.error);
    });
  };

  const passwordValid = validateHeadOfficePortalPassword(password, {
    minLength: passwordMinLength,
  }).ok;

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
                Set your password
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                {step === 'choose'
                  ? 'Choose a permanent portal password'
                  : 'Confirm your password'}
              </p>
            </div>
          </div>

          {step === 'choose' ? (
            <form
              onSubmit={handleChoose}
              className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm backdrop-blur-md"
            >
              {errorMsg ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                  {errorMsg}
                </div>
              ) : null}

              <p className="text-center text-xs text-slate-500">{passwordHint}</p>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={passwordMinLength}
                  autoComplete="new-password"
                  placeholder="New password"
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 pr-12 font-mono text-sm font-normal normal-case tracking-normal text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={!passwordValid}
                className="w-full rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
              >
                Continue
              </button>
            </form>
          ) : (
            <form
              onSubmit={handleConfirm}
              className="space-y-4 rounded-2xl border border-slate-200/90 bg-white/85 p-6 shadow-sm backdrop-blur-md"
            >
              {errorMsg ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                  {errorMsg}
                </div>
              ) : null}

              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={passwordMinLength}
                autoComplete="new-password"
                placeholder="Confirm password"
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 font-mono text-sm font-normal normal-case tracking-normal text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('choose');
                    setConfirmPassword('');
                    setErrorMsg('');
                  }}
                  className="flex-1 rounded-xl border border-slate-200 py-4 text-sm font-black uppercase tracking-wider text-slate-600"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isPending || confirmPassword.length < passwordMinLength}
                  className="flex-[2] rounded-xl bg-emerald-600 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-emerald-600/25 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
                >
                  {isPending ? 'Saving…' : 'Save password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
