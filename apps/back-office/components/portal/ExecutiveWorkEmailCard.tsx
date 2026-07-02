'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { AtSign, Shield, ShieldAlert } from 'lucide-react';

import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import { EXECUTIVE_PORTAL_OTP_EXPIRES_MINUTES } from '../../lib/executive-portal-auth-policy';
import type { HeadOfficeWorkEmailOtpDestination } from '../../lib/head-office-portal-work-email-change';
import {
  confirmExecutiveWorkEmailChangeAction,
  loadExecutiveWorkEmailProfileAction,
  requestExecutiveWorkEmailChangeAction,
} from '../../app/executive/settings/work-email-actions';

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all';

export default function ExecutiveWorkEmailCard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    workEmail: string;
    recoveryEmail: string | null;
    twoFactorEnabled: boolean;
    role: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [newWorkEmail, setNewWorkEmail] = useState('');
  const [sendOtpTo, setSendOtpTo] = useState<HeadOfficeWorkEmailOtpDestination>('work');
  const [totpCode, setTotpCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await loadExecutiveWorkEmailProfileAction();
    if ('error' in result) {
      setProfile(null);
      setLoadError(result.error);
    } else {
      setProfile({
        workEmail: result.workEmail,
        recoveryEmail: result.recoveryEmail,
        twoFactorEnabled: result.twoFactorEnabled,
        role: result.role,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resetForm = () => {
    setExpanded(false);
    setStep('form');
    setNewWorkEmail('');
    setSendOtpTo('work');
    setTotpCode('');
    setVerificationCode('');
    setOtpSentTo(null);
    setError(null);
    setMessage(null);
  };

  const handleRequest = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await requestExecutiveWorkEmailChangeAction({
        newWorkEmail,
        sendOtpTo,
        totpCode,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setOtpSentTo(result.otpSentTo);
      setStep('confirm');
      setMessage(`Verification code sent to ${result.otpSentTo}.`);
    });
  };

  const handleConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmExecutiveWorkEmailChangeAction({
        newWorkEmail,
        verificationCode,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setMessage('Work email updated. Other vault sessions were signed out.');
      resetForm();
      await reload();
    });
  };

  if (loading) {
    return (
      <ExecutiveGlassCard className="overflow-hidden p-6">
        <p className="text-sm font-semibold text-slate-500">Loading work email…</p>
      </ExecutiveGlassCard>
    );
  }

  if (loadError || !profile) {
    return (
      <ExecutiveGlassCard className="overflow-hidden p-6">
        <div className="flex items-start gap-2 text-sm text-rose-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError ?? 'Could not load work email settings.'}</span>
        </div>
      </ExecutiveGlassCard>
    );
  }

  const canUseRecoveryOtp = Boolean(profile.recoveryEmail?.trim());

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
              <AtSign className="h-5 w-5 text-violet-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Work email</h3>
              <p className="text-sm font-medium text-slate-600">
                MD Portal sign-in address on your MNR record.
              </p>
            </div>
          </div>
          {!expanded && profile.twoFactorEnabled ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-violet-800 hover:bg-violet-100"
            >
              Change
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-6">
        <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Current work email
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{profile.workEmail}</p>
          {profile.recoveryEmail ? (
            <p className="mt-2 text-xs text-slate-500">
              Recovery inbox: <span className="font-mono">{profile.recoveryEmail}</span>
            </p>
          ) : null}
        </div>

        {!profile.twoFactorEnabled ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Enable two-factor authentication before you can change your work email.</span>
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
                  value={newWorkEmail}
                  onChange={(event) => setNewWorkEmail(event.target.value)}
                  placeholder="New work email"
                  className={inputCls}
                />
                <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-3">
                  <legend className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Send OTP to
                  </legend>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="sendOtpTo"
                      checked={sendOtpTo === 'work'}
                      onChange={() => setSendOtpTo('work')}
                      className="mt-1"
                    />
                    <span>
                      Current work email{' '}
                      <span className="font-mono text-xs text-slate-500">({profile.workEmail})</span>
                    </span>
                  </label>
                  <label
                    className={`flex items-start gap-2 text-sm ${
                      canUseRecoveryOtp ? 'cursor-pointer text-slate-700' : 'cursor-not-allowed text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sendOtpTo"
                      checked={sendOtpTo === 'recovery'}
                      disabled={!canUseRecoveryOtp}
                      onChange={() => setSendOtpTo('recovery')}
                      className="mt-1"
                    />
                    <span>
                      Recovery email{' '}
                      {canUseRecoveryOtp ? (
                        <span className="font-mono text-xs text-slate-500">
                          ({profile.recoveryEmail})
                        </span>
                      ) : (
                        <span className="text-xs">— set a recovery email first</span>
                      )}
                    </span>
                  </label>
                </fieldset>
                <input
                  inputMode="numeric"
                  required
                  value={totpCode}
                  onChange={(event) =>
                    setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
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
                  Enter the 6-digit code sent to{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {otpSentTo ?? 'your chosen inbox'}
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
                    {isPending ? 'Saving…' : 'Confirm work email'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}

        {error ? <p className="text-sm font-bold text-rose-700">{error}</p> : null}
        {message ? <p className="text-sm font-bold text-emerald-700">{message}</p> : null}
      </div>
    </ExecutiveGlassCard>
  );
}
