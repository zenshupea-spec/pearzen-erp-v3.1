'use client';

import { useTransition, useState } from 'react';
import { Coffee, Eye, EyeOff, Radio } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { authenticateCafeFrontStaff } from '../../cafe-front/actions';
import {
  CAFE_FRONT_EPF_MAX_LENGTH,
  CAFE_FRONT_OTP_MAX_LENGTH,
} from '../../../lib/cafe-front-auth';

export default function CafeFrontLoginForm({
  cafeLogoUrl,
  companyLogoUrl,
  authError,
}: {
  cafeLogoUrl: string | null;
  companyLogoUrl: string | null;
  authError?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState(authError ?? '');
  const [epfNo, setEpfNo] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (formData: FormData) => {
    setErrorMsg('');
    startTransition(async () => {
      const result = await authenticateCafeFrontStaff(formData);
      if (result?.error) setErrorMsg(result.error);
      else if (result?.success) {
        window.location.href = result.needsPinSetup ? '/cafe-front/set-pin' : '/cafe-front';
      }
    });
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-slate-300 text-slate-900 antialiased">
      <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-[0_0_60px_-12px_rgba(15,23,42,0.25)]">
        <BrandWatermarkBackground logoUrl={companyLogoUrl} mode="portal" />

        <div className="relative z-10 flex min-h-[100dvh] flex-col justify-center px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
          <div className="mx-auto w-full space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="relative">
                <div
                  className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl ${
                    cafeLogoUrl
                      ? 'border border-slate-200 bg-white shadow-lg shadow-slate-900/10'
                      : 'border border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100 shadow-lg shadow-orange-200/40'
                  }`}
                >
                  {cafeLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cafeLogoUrl} alt="" className="h-full w-full object-contain p-2" />
                  ) : (
                    <Coffee className="h-10 w-10 text-orange-700" strokeWidth={1.75} />
                  )}
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm">
                  <Radio className="h-3 w-3 text-white" strokeWidth={2.5} />
                </span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">
                Café Tasha
              </p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900">
                Front Office
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Counter staff · orders · compliance · expiry
              </p>
            </div>
          </div>

          <form
            action={handleLogin}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
                EPF No
              </label>
              <input
                type="text"
                name="epfNo"
                value={epfNo}
                onChange={(e) =>
                  setEpfNo(e.target.value.toUpperCase().slice(0, CAFE_FRONT_EPF_MAX_LENGTH))
                }
                placeholder="EPF membership number"
                required
                maxLength={CAFE_FRONT_EPF_MAX_LENGTH}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-xl font-bold uppercase text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10"
              />
              <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Max {CAFE_FRONT_EPF_MAX_LENGTH} characters
              </p>
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
                  maxLength={CAFE_FRONT_OTP_MAX_LENGTH}
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 pr-12 text-center font-mono text-2xl font-black tracking-[0.5em] text-slate-900 shadow-inner transition-all placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10"
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

            {errorMsg ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
                {errorMsg}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending || epfNo.trim().length === 0}
              className="mt-2 w-full rounded-xl bg-orange-600 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-orange-600/25 transition-all hover:bg-orange-500 active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? 'Verifying…' : 'Secure access'}
            </button>
          </form>

          <div className="space-y-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              GPS · Selfie check-in at site · HR verifies identity
            </p>
            <p className="text-[10px] font-mono text-slate-400">
              OTP expires in 1 minute · Forgot your PIN? Contact HR to issue a new OTP.
            </p>
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}
