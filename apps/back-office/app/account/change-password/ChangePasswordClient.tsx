'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Shield,
} from 'lucide-react';

import { changeHeadOfficePortalPasswordAction } from '../../actions/portal-profile-actions';
import { signOutHeadOfficePortalAction } from '../../actions/portal-session-actions';
import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import { HO_PORTAL_PASSWORD_HINT } from '../../../lib/head-office-portal-password';
import {
  PORTAL_PASSWORD_HISTORY_DEPTH,
  PORTAL_PASSWORD_MAX_AGE_DAYS,
} from '../../../lib/portal-password-rotation';

type Props = {
  returnPath: string;
  forced: boolean;
  mustChangePassword: boolean;
  fullName: string;
  rank: string | null;
  passwordExpiresAt: string | null;
  daysUntilExpiry: number | null;
  companyName: string | null;
  logoUrl: string | null;
};

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm font-semibold text-slate-900 outline-none transition focus:border-[color:var(--cvs-accent)] focus:ring-2 focus:ring-[color:var(--cvs-accent-muted)]"
          required
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-slate-400 hover:text-slate-600"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

export default function ChangePasswordClient({
  returnPath,
  forced,
  mustChangePassword,
  fullName,
  rank,
  passwordExpiresAt,
  daysUntilExpiry,
  companyName,
  logoUrl,
}: Props) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSigningOut, startSignOut] = useTransition();

  const displayCompanyName = companyName?.trim() || 'Staff Portal';
  const showForcedBanner = forced || mustChangePassword;

  const expiryStatus = useMemo(() => {
    if (forced || (daysUntilExpiry !== null && daysUntilExpiry <= 0)) {
      return {
        tone: 'expired' as const,
        label: 'Password expired',
        detail: passwordExpiresAt
          ? `Expired on ${passwordExpiresAt}. Choose a new password to continue.`
          : 'Your portal password has expired. Choose a new password to continue.',
      };
    }
    if (mustChangePassword) {
      return {
        tone: 'required' as const,
        label: 'Password change required',
        detail:
          'Your administrator requires a new password before you can continue using staff portals.',
      };
    }
    if (passwordExpiresAt) {
      const dayLabel =
        daysUntilExpiry === 1 ? 'day' : 'days';
      const countdown =
        daysUntilExpiry !== null && daysUntilExpiry >= 0
          ? ` (${daysUntilExpiry} ${dayLabel} remaining)`
          : '';
      return {
        tone: 'active' as const,
        label: 'Current password expires',
        detail: `${passwordExpiresAt}${countdown}`,
      };
    }
    return {
      tone: 'active' as const,
      label: 'Password rotation policy',
      detail: `Portal passwords rotate every ${PORTAL_PASSWORD_MAX_AGE_DAYS} days.`,
    };
  }, [
    daysUntilExpiry,
    forced,
    mustChangePassword,
    passwordExpiresAt,
  ]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMsg('');

    if (newPassword.trim() !== confirmPassword.trim()) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }

    startTransition(async () => {
      const result = await changeHeadOfficePortalPasswordAction(
        currentPassword,
        newPassword,
        confirmPassword,
      );
      if ('error' in result) {
        setErrorMsg(result.error);
        return;
      }

      setSuccess(true);
      window.setTimeout(() => {
        router.replace(returnPath);
        router.refresh();
      }, 900);
    });
  }

  function handleSignOut() {
    startSignOut(async () => {
      await signOutHeadOfficePortalAction('/login/hq');
    });
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#eef2f6] text-slate-900 antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl} mode="sparse" />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(rgb(148 163 184 / 0.35) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain p-2" />
            ) : (
              <Shield className="h-8 w-8 text-[color:var(--cvs-accent)]" strokeWidth={1.75} />
            )}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
            {displayCompanyName}
          </p>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight text-slate-900 sm:text-3xl">
            Change password
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            {fullName}
            {rank ? (
              <span className="font-medium text-slate-400"> · {rank}</span>
            ) : null}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/5 backdrop-blur-md">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  expiryStatus.tone === 'expired' || expiryStatus.tone === 'required'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-[var(--cvs-accent-soft)] text-[color:var(--cvs-accent)]'
                }`}
              >
                {expiryStatus.tone === 'expired' || expiryStatus.tone === 'required' ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <CalendarClock className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  {expiryStatus.label}
                </p>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">
                  {expiryStatus.detail}
                </p>
              </div>
            </div>
          </div>

          {success ? (
            <div className="space-y-4 px-5 py-8 text-center sm:px-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <p className="text-lg font-black text-slate-900">Password updated</p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Returning you to your portal…
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-6 sm:px-6">
              {showForcedBanner ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900">
                  {forced
                    ? 'Your portal password has expired. You must choose a new password before continuing to OM, TM, HQ, and other staff portals.'
                    : 'A new password is required before you can continue using staff portals.'}
                </p>
              ) : null}

              <PasswordField
                id="current-password"
                label="Current password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
              />

              <PasswordField
                id="new-password"
                label="New password"
                autoComplete="new-password"
                value={newPassword}
                onChange={setNewPassword}
              />

              <PasswordField
                id="confirm-password"
                label="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                  <KeyRound className="h-3.5 w-3.5" />
                  Password policy
                </div>
                <ul className="mt-2 space-y-1.5 text-sm font-medium text-slate-600">
                  <li>{HO_PORTAL_PASSWORD_HINT}</li>
                  <li>
                    Passwords rotate every {PORTAL_PASSWORD_MAX_AGE_DAYS} days and cannot reuse
                    your last {PORTAL_PASSWORD_HISTORY_DEPTH} passwords.
                  </li>
                </ul>
              </div>

              {errorMsg ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
                >
                  {errorMsg}
                </p>
              ) : null}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-[color:var(--cvs-accent)] px-5 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:opacity-95 disabled:opacity-60"
                >
                  {isPending ? 'Saving…' : 'Update password'}
                </button>
                {!showForcedBanner ? (
                  <button
                    type="button"
                    onClick={() => router.push(returnPath)}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSigningOut}
                    onClick={handleSignOut}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {isSigningOut ? 'Signing out…' : 'Sign out'}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {!showForcedBanner && !success ? (
          <p className="mt-4 text-center text-xs font-medium text-slate-500">
            After updating, you&apos;ll return to{' '}
            <span className="font-semibold text-slate-700">{returnPath}</span>.
          </p>
        ) : null}
      </main>
    </div>
  );
}
