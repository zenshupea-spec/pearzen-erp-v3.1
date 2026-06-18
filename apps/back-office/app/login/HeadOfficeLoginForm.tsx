'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Eye, EyeOff, Radio } from 'lucide-react';

import { readDeviceGeolocationWithRetry } from '../../lib/device-geolocation';
import {
  HO_PORTAL_OTP_LENGTH,
  HO_PORTAL_PASSWORD_MIN_LENGTH,
} from '../../lib/head-office-portal-password';
import {
  authenticateHeadOfficeStaff,
  headOfficeLoginRequiresGeolocation,
} from './head-office/actions';

function isLocationRelatedLoginError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('location') ||
    lower.includes('geofence') ||
    lower.includes('gps')
  );
}

export default function HeadOfficeLoginForm({
  authError,
  authErrorDetail,
  nextPath = '/',
}: {
  authError?: string | null;
  authErrorDetail?: string | null;
  nextPath?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState(authError ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationHint, setLocationHint] = useState<string | null>(null);

  const handleLogin = useCallback(
    (formData: FormData) => {
      setErrorMsg('');
      setLocationHint(null);

      const workEmail = email.trim().toLowerCase();
      formData.set('email', workEmail);
      formData.set('password', password);
      formData.set('next', nextPath);

      startTransition(async () => {
        const geofenceRequired = workEmail
          ? await headOfficeLoginRequiresGeolocation(workEmail)
          : true;

        let geo: Awaited<ReturnType<typeof readDeviceGeolocationWithRetry>> = {
          ok: false,
          error: '',
        };

        if (geofenceRequired) {
          setLocating(true);
          geo = await readDeviceGeolocationWithRetry();
          setLocating(false);
          if (geo.ok) {
            formData.set('lat', String(geo.latitude));
            formData.set('lng', String(geo.longitude));
          }
        }

        const result = await authenticateHeadOfficeStaff(formData);
        if (result?.error) {
          setErrorMsg(result.error);
          if (
            geofenceRequired &&
            !geo.ok &&
            isLocationRelatedLoginError(result.error)
          ) {
            setLocationHint(geo.error);
          }
        }
      });
    },
    [email, password, nextPath],
  );

  useEffect(() => {
    if (authError) setErrorMsg(authError);
  }, [authError]);

  const passwordReady =
    password.length >= HO_PORTAL_PASSWORD_MIN_LENGTH ||
    password.length === HO_PORTAL_OTP_LENGTH;

  return (
    <form action={handleLogin} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />

      {(errorMsg || (authError && !errorMsg)) ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-xs font-bold text-rose-700">
          {errorMsg || authError}
          {authErrorDetail ? (
            <span className="mt-1 block font-medium">{authErrorDetail}</span>
          ) : null}
          {locationHint ? (
            <span className="mt-1 block font-medium">{locationHint}</span>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
          Work email
        </label>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
          placeholder="you@company.com"
          required
          autoComplete="username"
          className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
        />
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
          OTP / Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6-digit OTP or permanent password"
            required
            autoComplete="current-password"
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
      </div>

      <button
        type="submit"
        disabled={isPending || locating || email.trim().length === 0 || !passwordReady}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
      >
        {locating ? (
          <>
            <Radio className="h-4 w-4 animate-pulse" />
            Checking HQ location…
          </>
        ) : isPending ? (
          'Signing in…'
        ) : (
          'Secure access'
        )}
      </button>
    </form>
  );
}
