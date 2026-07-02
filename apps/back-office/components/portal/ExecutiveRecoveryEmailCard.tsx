'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Mail, Shield, ShieldAlert } from 'lucide-react';

import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import { EXECUTIVE_PORTAL_OTP_EXPIRES_MINUTES } from '../../lib/executive-portal-auth-policy';
import {
  confirmExecutiveRecoveryEmailChangeAction,
  loadExecutiveRecoveryEmailProfileAction,
  requestExecutiveRecoveryEmailChangeAction,
} from '../../app/executive/settings/recovery-email-actions';

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';

function formatVerifiedAt(iso: string | null): string {
  if (!iso) return 'Not verified yet';
  try {
    return new Intl.DateTimeFormat('en-LK', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export const EXECUTIVE_RECOVERY_EMAIL_SECTION_ID = 'recovery-email';

export function openExecutiveRecoveryEmailSection() {
  window.history.replaceState(null, '', `#${EXECUTIVE_RECOVERY_EMAIL_SECTION_ID}`);
  window.dispatchEvent(new Event('executive-recovery-email-open'));
  requestAnimationFrame(() => {
    document.getElementById(EXECUTIVE_RECOVERY_EMAIL_SECTION_ID)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}

export default function ExecutiveRecoveryEmailCard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    workEmail: string;
    recoveryEmail: string | null;
    recoveryEmailVerifiedAt: string | null;
    twoFactorEnabled: boolean;
    role: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [newRecoveryEmail, setNewRecoveryEmail] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await loadExecutiveRecoveryEmailProfileAction();
    if ('error' in result) {
      setProfile(null);
      setLoadError(result.error);
    } else {
      setProfile({
        workEmail: result.workEmail,
        recoveryEmail: result.recoveryEmail,
        recoveryEmailVerifiedAt: result.recoveryEmailVerifiedAt,
        twoFactorEnabled: result.twoFactorEnabled,
        role: result.role,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash !== `#${EXECUTIVE_RECOVERY_EMAIL_SECTION_ID}`) return;
      setExpanded(true);
      document.getElementById(EXECUTIVE_RECOVERY_EMAIL_SECTION_ID)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    };
    const openFromEvent = () => {
      setExpanded(true);
      document.getElementById(EXECUTIVE_RECOVERY_EMAIL_SECTION_ID)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    window.addEventListener('executive-recovery-email-open', openFromEvent);
    return () => {
      window.removeEventListener('hashchange', openFromHash);
      window.removeEventListener('executive-recovery-email-open', openFromEvent);
    };
  }, []);

  const resetForm = () => {
    setExpanded(false);
    setStep('form');
    setNewRecoveryEmail('');
    setTotpCode('');
    setVerificationCode('');
    setError(null);
    setMessage(null);
  };

  const handleRequest = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await requestExecutiveRecoveryEmailChangeAction({
        newRecoveryEmail,
        totpCode,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setStep('confirm');
      setMessage(`Verification code sent to ${newRecoveryEmail.trim().toLowerCase()}.`);
    });
  };

  const handleConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmExecutiveRecoveryEmailChangeAction({
        newRecoveryEmail,
        verificationCode,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setMessage('Recovery email updated and verified.');
      resetForm();
      await reload();
    });
  };

  if (loading) {
    return (
      <ExecutiveGlassCard className="overflow-hidden p-6">
        <p className="text-sm font-semibold text-slate-500">Loading recovery email…</p>
      </ExecutiveGlassCard>
    );
  }

  if (loadError || !profile) {
    return (
      <ExecutiveGlassCard className="overflow-hidden p-6">
        <div className="flex items-start gap-2 text-sm text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError ?? 'Could not load recovery email settings.'}</span>
        </div>
      </ExecutiveGlassCard>
    );
  }

  return (
    <ExecutiveGlassCard id={EXECUTIVE_RECOVERY_EMAIL_SECTION_ID} className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-50/80">
              <Mail className="h-5 w-5 text-sky-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Recovery email</h3>
              <p className="text-sm font-medium text-slate-600">
                Personal inbox for MD/OD account recovery — must differ from your work email.
              </p>
            </div>
          </div>
          {!expanded && profile.twoFactorEnabled ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-sky-800 hover:bg-sky-100"
            >
              Change
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Work email
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{profile.workEmail}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Recovery email
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {profile.recoveryEmail ?? 'Not set'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Verified: {formatVerifiedAt(profile.recoveryEmailVerifiedAt)}
            </p>
          </div>
        </div>

        {!profile.recoveryEmail ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No recovery email on file yet. Add a personal inbox below after 2FA is enabled, or ask
              HR to set one on your MNR record before portal OTP is issued.
            </span>
          </div>
        ) : null}

        {!profile.twoFactorEnabled ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Enable two-factor authentication above before you can change your recovery email.
            </span>
          </div>
        ) : null}

        {expanded && profile.twoFactorEnabled ? (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-800">
              <Shield className="h-3.5 w-3.5" />
              Requires your current 6-digit authenticator code
            </div>

            {step === 'form' ? (
              <form onSubmit={handleRequest} className="space-y-3">
                <input
                  type="email"
                  required
                  value={newRecoveryEmail}
                  onChange={(event) => setNewRecoveryEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                  placeholder="New recovery email"
                  className={inputCls}
                />
                <input
                  inputMode="numeric"
                  required
                  value={totpCode}
                  onChange={(event) =>
                    setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && totpCode.length !== 6) {
                      event.preventDefault();
                    }
                  }}
                  placeholder="6-digit authenticator code"
                  className={`${inputCls} text-center font-mono tracking-[0.35em]`}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || totpCode.length !== 6}
                    className="flex-1 rounded-xl bg-slate-900 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    {isPending ? 'Sending…' : 'Send verification code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirm} className="space-y-3">
                <p className="text-sm text-slate-600">
                  Enter the 6-digit code emailed to{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {newRecoveryEmail.trim().toLowerCase()}
                  </span>{' '}
                  (expires in {EXECUTIVE_PORTAL_OTP_EXPIRES_MINUTES} minutes).
                </p>
                <input
                  inputMode="numeric"
                  required
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && verificationCode.length !== 6) {
                      event.preventDefault();
                    }
                  }}
                  placeholder="6-digit verification code"
                  className={`${inputCls} text-center font-mono tracking-[0.35em]`}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('form');
                      setVerificationCode('');
                      setError(null);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase text-slate-600"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isPending || verificationCode.length !== 6}
                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    {isPending ? 'Saving…' : 'Confirm recovery email'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm font-bold text-rose-700">{error}</p>
        ) : null}
        {message ? (
          <p className="text-sm font-bold text-emerald-700">{message}</p>
        ) : null}
      </div>
    </ExecutiveGlassCard>
  );
}
