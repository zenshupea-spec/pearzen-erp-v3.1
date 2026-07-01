'use client';

import { useTransition, useState } from 'react';
import { Building2, Eye, EyeOff, Radio } from 'lucide-react';

import CafeFrontDeviceFrame from '../../cafe-front/CafeFrontDeviceFrame';
import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { authenticateShalomFrontStaff } from '../../shalom-front/actions';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';
import {
  SHALOM_FRONT_EPF_MAX_LENGTH,
  SHALOM_FRONT_OTP_MAX_LENGTH,
} from '../../../lib/shalom-front-auth-shared';

export default function ShalomFrontLoginForm({
  companyLogoUrl,
  authError,
}: {
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
      const result = await authenticateShalomFrontStaff(formData);
      if (result?.error) setErrorMsg(result.error);
      else if (result?.success) {
        window.location.href = result.needsPinSetup ? '/shalom-front/set-pin' : '/shalom-front';
      }
    });
  };

  return (
    <CafeFrontDeviceFrame>
      <BrandWatermarkBackground logoUrl={companyLogoUrl} mode="portal" />

      <div className="relative z-10 flex min-h-[100dvh] flex-col justify-center px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full space-y-8">
          <div className="space-y-4 text-center">
            <div className="mb-2 flex justify-center">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-[color:var(--cvs-accent-muted)] bg-[var(--cvs-accent-soft)] shadow-lg shadow-[color:var(--cvs-glow)]">
                  <Building2 className="h-10 w-10 text-[color:var(--cvs-accent)]" strokeWidth={1.75} />
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[color:var(--cvs-accent)] shadow-sm">
                  <Radio className="h-3 w-3 text-white" strokeWidth={2.5} />
                </span>
              </div>
            </div>
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[0.35em] ${CVS_BRAND_CLASSES.portalEyebrow}`}>
                Shalom Residence
              </p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-900">
                Front Office
              </h1>
              <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Caretaker · property calendar · guest collections
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
                  setEpfNo(e.target.value.toUpperCase().slice(0, SHALOM_FRONT_EPF_MAX_LENGTH))
                }
                placeholder="EPF membership number"
                required
                maxLength={SHALOM_FRONT_EPF_MAX_LENGTH}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className={`w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-xl font-bold uppercase text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 ${CVS_BRAND_CLASSES.focusRing}`}
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
                  maxLength={SHALOM_FRONT_OTP_MAX_LENGTH}
                  className={`w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 pr-12 text-center font-mono text-2xl font-black tracking-[0.5em] text-slate-900 shadow-inner transition-all placeholder:text-base placeholder:tracking-normal placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 ${CVS_BRAND_CLASSES.focusRing}`}
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
              className="mt-2 w-full rounded-xl bg-[color:var(--cvs-accent)] py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-[color:var(--cvs-glow)] transition-all hover:bg-[color:var(--cvs-accent-hover)] active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? 'Verifying…' : 'Secure access'}
            </button>
          </form>

          <div className="space-y-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              EPF + 6-digit PIN only · No login selfie
            </p>
            <p className="mx-auto max-w-xs text-[10px] leading-relaxed text-slate-400">
              Shalom caretakers authenticate with HR OTP/PIN only — unlike café counter staff, there is
              no face capture at login. HR provisions access at{' '}
              <span className="font-semibold text-slate-500">/hr/shalom-portal</span>.
            </p>
          </div>
        </div>
      </div>
    </CafeFrontDeviceFrame>
  );
}
