'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Eye, EyeOff, Radio } from 'lucide-react';

import type { StaffPortalId } from '../../lib/portal-isolation';
import { readDeviceGeolocationWithRetry } from '../../lib/device-geolocation';
import {
  HO_PORTAL_OTP_LENGTH,
  HO_PORTAL_PASSWORD_MIN_LENGTH,
} from '../../lib/head-office-portal-password';
import {
  EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH,
  HQ_PORTAL_PASSWORD_MIN_LENGTH,
} from '../../lib/executive-portal-auth-policy';
import {
  authenticateHeadOfficeStaff,
  headOfficeLoginIdentifierRequiresGeolocation,
} from './head-office/actions';

function isLocationRelatedLoginError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('location') ||
    lower.includes('geofence') ||
    lower.includes('gps')
  );
}

function isWorkEmailReady(value: string): boolean {
  const email = value.trim().toLowerCase();
  const at = email.indexOf('@');
  if (at <= 0) return false;
  const domain = email.slice(at + 1);
  return domain.includes('.');
}

export default function HeadOfficeLoginForm({
  authError,
  authErrorDetail,
  nextPath = '/',
  staffPortal,
  signInHint,
}: {
  authError?: string | null;
  authErrorDetail?: string | null;
  nextPath?: string;
  staffPortal?: StaffPortalId;
  signInHint?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState(authError ?? '');
  const [workEmail, setWorkEmail] = useState('');
  const [credential, setCredential] = useState('');
  const [showCredential, setShowCredential] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationHint, setLocationHint] = useState<string | null>(null);

  const handleLogin = useCallback(
    (formData: FormData) => {
      setErrorMsg('');
      setLocationHint(null);

      const emailValue = workEmail.trim().toLowerCase();
      formData.set('email', emailValue);
      formData.set('password', credential);
      formData.set('next', nextPath);

      startTransition(async () => {
        const geofenceNeeded =
          staffPortal === 'md'
            ? false
            : emailValue.length >= 3
              ? await headOfficeLoginIdentifierRequiresGeolocation(emailValue, staffPortal)
              : true;

        let geo: Awaited<ReturnType<typeof readDeviceGeolocationWithRetry>> = {
          ok: false,
          error: '',
        };

        if (geofenceNeeded) {
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
            geofenceNeeded &&
            !geo.ok &&
            isLocationRelatedLoginError(result.error)
          ) {
            setLocationHint(geo.error);
          }
        }
      });
    },
    [workEmail, credential, nextPath, staffPortal],
  );

  useEffect(() => {
    if (authError) setErrorMsg(authError);
  }, [authError]);

  const isMdPortal = staffPortal === 'md';
  const isHqPortal = staffPortal === 'hq';
  const passwordMinLength = isMdPortal
    ? EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH
    : isHqPortal
      ? HQ_PORTAL_PASSWORD_MIN_LENGTH
      : HO_PORTAL_PASSWORD_MIN_LENGTH;

  const credentialReady =
    credential.length >= passwordMinLength ||
    credential.length === HO_PORTAL_OTP_LENGTH;

  const emailReady = isWorkEmailReady(workEmail);

  return (
    <div className="space-y-4">
      {isHqPortal ? (
        <div className="rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2.5 text-center text-[11px] font-semibold leading-relaxed text-sky-900">
          HQ Staff sign in with your <strong>work email</strong> and the 6-digit OTP from HR, then
          set a portal password (minimum <strong>{HQ_PORTAL_PASSWORD_MIN_LENGTH} characters</strong>
          ).
        </div>
      ) : null}

      {signInHint && !isMdPortal ? (
        <p className="text-center text-xs font-medium text-slate-500">{signInHint}</p>
      ) : null}

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

      <form action={handleLogin} className="space-y-4">
        <input type="hidden" name="next" value={nextPath} />
        {staffPortal ? (
          <input type="hidden" name="staffPortal" value={staffPortal} />
        ) : null}

        <div>
          <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
            Work email
          </label>
          <input
            type="email"
            name="email"
            value={workEmail}
            onChange={(e) => setWorkEmail(e.target.value)}
            placeholder="name@company.com"
            required
            autoComplete="username"
            className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold normal-case tracking-normal text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
          />
        </div>

        <div>
          <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-600">
            {isMdPortal ? 'Portal password' : 'OTP or portal PIN'}
          </label>
          <div className="relative">
            <input
              type={showCredential ? 'text' : 'password'}
              name="password"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder={
                isMdPortal
                  ? `Portal password (min ${EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH} characters)`
                  : '6-digit OTP or your portal PIN'
              }
              required
              autoComplete="current-password"
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-4 pr-12 font-mono text-sm font-normal normal-case tracking-normal text-slate-900 shadow-inner transition-all placeholder:text-slate-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-500/10"
            />
            <button
              type="button"
              onClick={() => setShowCredential((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
            >
              {showCredential ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {!isMdPortal ? (
            <p className="mt-2 text-[10px] font-semibold text-slate-500">
              {isHqPortal
                ? `First sign-in uses the 6-digit OTP from HR. After setup, use your portal password (minimum ${HQ_PORTAL_PASSWORD_MIN_LENGTH} characters).`
                : 'First sign-in uses the 6-digit OTP from HR or OD. After setup, use your portal PIN.'}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isPending || locating || !emailReady || !credentialReady}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-md shadow-slate-900/25 transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50"
        >
          {locating ? (
            <>
              <Radio className="h-4 w-4 animate-pulse" />
              Checking HQ location…
            </>
          ) : isPending ? (
            'Signing in…'
          ) : isMdPortal ? (
            'Sign in to MD Portal'
          ) : (
            'Secure access'
          )}
        </button>
      </form>

      {isMdPortal ? (
        <p className="text-center text-[11px] font-medium text-slate-500">
          <Link
            href="/login/md/request-code"
            className="font-semibold text-indigo-700 underline-offset-2 hover:text-indigo-900 hover:underline"
          >
            Forgot password?
          </Link>
        </p>
      ) : null}
    </div>
  );
}
