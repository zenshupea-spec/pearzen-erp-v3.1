'use client';

import { useCallback, useState, useTransition } from 'react';
import { Eye, EyeOff, MapPin, Radio, Shield } from 'lucide-react';

import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { readDeviceGeolocationWithRetry } from '../../../lib/device-geolocation';
import {
  HO_PORTAL_OTP_LENGTH,
  HO_PORTAL_PASSWORD_HINT,
  HO_PORTAL_PASSWORD_MIN_LENGTH,
} from '../../../lib/head-office-portal-password';
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
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setErrorMsg('');
      setLocationHint(null);

      if (needsSetup && code.length !== HO_PORTAL_OTP_LENGTH) {
        setErrorMsg(`Enter the ${HO_PORTAL_OTP_LENGTH}-digit OTP.`);
        return;
      }
      if (!needsSetup && code.length < HO_PORTAL_PASSWORD_MIN_LENGTH) {
        setErrorMsg(`Enter your ${HO_PORTAL_PASSWORD_MIN_LENGTH}+ character password.`);
        return;
      }

      setLocating(true);
      startTransition(async () => {
        const geo = await readDeviceGeolocationWithRetry();
        setLocating(false);

        if (!geo.ok) {
          setLocationHint(geo.error);
          setErrorMsg('Could not verify your location.');
          return;
        }

        const result = await verifyHeadOfficePinAction(code, geo.latitude, geo.longitude);
        if (result?.error) setErrorMsg(result.error);
      });
    },
    [code, needsSetup],
  );

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
                {needsSetup ? 'Enter your one-time password' : 'Enter your portal password'}
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
                {locationHint ? (
                  <span className="mt-1 block font-medium">{locationHint}</span>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-2 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-sky-800">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              GPS required — HQ geofence
            </div>

            <p className="text-center text-xs text-slate-500">
              {needsSetup
                ? 'Use the OTP from OD or MD to continue, then choose your permanent password.'
                : HO_PORTAL_PASSWORD_HINT}
            </p>

            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={code}
                onChange={(e) =>
                  setCode(
                    needsSetup
                      ? e.target.value.replace(/\D/g, '').slice(0, HO_PORTAL_OTP_LENGTH)
                      : e.target.value,
                  )
                }
                inputMode={needsSetup ? 'numeric' : 'text'}
                maxLength={needsSetup ? HO_PORTAL_OTP_LENGTH : 128}
                autoComplete={needsSetup ? 'one-time-code' : 'current-password'}
                placeholder={needsSetup ? '6-digit OTP' : 'Portal password'}
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 pr-12 text-sm font-semibold text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
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
              disabled={
                isPending ||
                locating ||
                (needsSetup
                  ? code.length !== HO_PORTAL_OTP_LENGTH
                  : code.length < HO_PORTAL_PASSWORD_MIN_LENGTH)
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
            >
              {locating ? (
                <>
                  <Radio className="h-4 w-4 animate-pulse" />
                  Locating…
                </>
              ) : isPending ? (
                'Verifying…'
              ) : (
                'Continue'
              )}
            </button>
          </form>

          <p className="text-center text-[10px] font-mono text-slate-400">
            Forgot your password? Ask OD or MD to issue a new OTP or reset access.
          </p>
        </div>
      </main>
    </div>
  );
}
