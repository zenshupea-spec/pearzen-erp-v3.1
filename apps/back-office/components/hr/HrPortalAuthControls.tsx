'use client';

import { useEffect, useState, useTransition } from 'react';
import { KeyRound, Mail, RefreshCw, Unlock } from 'lucide-react';

import {
  hrForceHeadOfficePasswordRotationAction,
  hrGetPortalAuthStatusAction,
  hrProvisionHeadOfficePortalOtpAction,
  hrUnlockHeadOfficePortalUsernameAction,
} from '../../app/hr/portal-auth-actions';
import PortalOtpCountdown from '../../app/executive/settings/PortalOtpCountdown';
import {
  headOfficeOtpExpiryHint,
  otpLifetimeMsForRank,
  passwordMinLengthForRank,
  receivesWorkEmailOtpOnProvision,
} from '../../lib/executive-portal-auth-policy';
import { isExecutiveRank } from '../../lib/portal-role-utils';

type OtpDeliveryResult = {
  emailed: boolean;
  otp?: string;
  email?: string;
  loginUsername?: string;
  expiresAt: number;
  otpLifetimeMs: number;
  emailWarning?: string;
};

export default function HrPortalAuthControls({
  employeeId,
  employeeName,
  employeeRank,
  isUsernameLocked = false,
}: {
  employeeId: string;
  employeeName: string;
  employeeRank?: string | null;
  isUsernameLocked?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(Boolean(isUsernameLocked));
  const [isProvisioned, setIsProvisioned] = useState(false);
  const [needsPinSetup, setNeedsPinSetup] = useState(true);
  const [deliveryResult, setDeliveryResult] = useState<OtpDeliveryResult | null>(null);

  const rank = (employeeRank ?? '').toUpperCase();
  const otpExpiryHint = headOfficeOtpExpiryHint(employeeRank);
  const defaultOtpLifetimeMs = otpLifetimeMsForRank(employeeRank);
  const hqPasswordMinLength = passwordMinLengthForRank(employeeRank);
  const isExecutiveTarget = isExecutiveRank(employeeRank);
  const emailOtpTarget = receivesWorkEmailOtpOnProvision(employeeRank);
  const canProvision = !isExecutiveTarget && rank !== 'HR';
  const canUnlock = locked && !isExecutiveTarget;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await hrGetPortalAuthStatusAction(employeeId);
      if (cancelled || 'error' in status) return;
      setLocked(Boolean(status.isUsernameLocked));
      setIsProvisioned(Boolean(status.isProvisioned));
      setNeedsPinSetup(Boolean(status.needsPinSetup));
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const handleOtp = () => {
    setError(null);
    startTransition(async () => {
      const result = await hrProvisionHeadOfficePortalOtpAction(employeeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.success) {
        setDeliveryResult({
          emailed: Boolean(result.emailed),
          otp: result.otp,
          email: result.email,
          loginUsername: result.loginUsername,
          expiresAt: result.expiresAt ?? Date.now() + defaultOtpLifetimeMs,
          otpLifetimeMs: result.otpLifetimeMs ?? defaultOtpLifetimeMs,
          emailWarning: result.emailWarning,
        });
      }
    });
  };

  const handleUnlock = () => {
    setError(null);
    startTransition(async () => {
      const result = await hrUnlockHeadOfficePortalUsernameAction(employeeId);
      if (result.error) setError(result.error);
      else setLocked(false);
    });
  };

  const handleForceRotation = () => {
    setError(null);
    startTransition(async () => {
      const result = await hrForceHeadOfficePasswordRotationAction(employeeId);
      if (result.error) setError(result.error);
    });
  };

  const canForceRotation = isProvisioned && !needsPinSetup;

  if (!canProvision && !canUnlock) {
    if (isExecutiveTarget) {
      return (
        <p className="text-[10px] font-semibold text-amber-800">
          MD and OD portal OTP is issued from Executive → Security &amp; Access (MD Portal).
        </p>
      );
    }
    if (rank === 'HR') {
      return (
        <p className="text-[10px] font-semibold text-amber-800">
          HR portal OTP must be issued by OD or MD (emailed to work address).
        </p>
      );
    }
    return null;
  }

  const otpButtonLabel = emailOtpTarget
    ? deliveryResult?.emailed
      ? 'Resend OTP email'
      : 'Email OTP to staff'
    : deliveryResult
      ? 'Generate new HR OTP'
      : 'Generate HR OTP';

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/80 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-violet-800">
        Portal access — {employeeName}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {canProvision ? (
          <button
            type="button"
            disabled={isPending}
            onClick={handleOtp}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {emailOtpTarget && deliveryResult?.emailed ? (
              <Mail className={`h-3 w-3 ${isPending ? 'animate-pulse' : ''}`} />
            ) : (
              <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
            )}
            {isPending ? 'Working…' : otpButtonLabel}
          </button>
        ) : null}
        {canUnlock ? (
          <button
            type="button"
            disabled={isPending}
            onClick={handleUnlock}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-sky-900 hover:bg-sky-100 disabled:opacity-50"
          >
            <Unlock className="h-3 w-3" />
            Unlock user
          </button>
        ) : null}
        {canForceRotation ? (
          <button
            type="button"
            disabled={isPending}
            onClick={handleForceRotation}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            <KeyRound className="h-3 w-3" />
            Require password change
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-[10px] font-bold text-rose-700">{error}</p>
      ) : null}
      {deliveryResult?.emailed ? (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-[11px] text-emerald-950">
          <p className="font-black uppercase tracking-wider">OTP emailed</p>
          <p className="mt-1">
            A new 6-digit code was sent to{' '}
            <strong>{deliveryResult.email ?? 'their work email'}</strong> from{' '}
            <strong>support@pearzen.tech</strong>.
          </p>
          {deliveryResult.loginUsername ? (
            <p className="mt-1">
              Username (EPF): <strong>{deliveryResult.loginUsername}</strong>
            </p>
          ) : null}
          <p className="mt-1 text-emerald-800">
            {otpExpiryHint} Previous password and 2FA are invalidated. Permanent portal password
            must be at least {hqPasswordMinLength} characters.
          </p>
          {deliveryResult.emailWarning ? (
            <p className="mt-2 font-semibold text-amber-800">{deliveryResult.emailWarning}</p>
          ) : null}
        </div>
      ) : deliveryResult?.otp ? (
        <div className="mt-3 rounded-lg border border-violet-300 bg-white p-3 text-[11px] text-violet-950">
          <p className="font-black uppercase tracking-wider">HR OTP — share in person</p>
          <p className="mt-2 font-mono text-3xl font-black tracking-[0.35em] text-violet-900">
            {deliveryResult.otp}
          </p>
          <p className="mt-2 text-violet-800">
            Read this code to {employeeName} at the HR desk. It is <strong>not emailed</strong>.
            {deliveryResult.loginUsername ? (
              <>
                {' '}
                EPF username: <strong>{deliveryResult.loginUsername}</strong>.
              </>
            ) : null}
          </p>
          <p className="mt-1 text-violet-700">
            {otpExpiryHint} Staff then set a {hqPasswordMinLength}+ character password and enroll
            2FA.
          </p>
          <PortalOtpCountdown
            expiresAt={deliveryResult.expiresAt}
            lifetimeMs={deliveryResult.otpLifetimeMs}
            onExpired={() => setDeliveryResult(null)}
          />
        </div>
      ) : deliveryResult ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-950">
          <p className="font-black uppercase tracking-wider">OTP issued — email not delivered</p>
          <p className="mt-1 text-amber-800">
            A new code was generated but could not be emailed. Check{' '}
            <strong>RESEND_API_KEY</strong> and <strong>PORTAL_EMAIL_FROM</strong>, then try again.
          </p>
          {deliveryResult.loginUsername ? (
            <p className="mt-1">
              Username (EPF): <strong>{deliveryResult.loginUsername}</strong>
            </p>
          ) : null}
          {deliveryResult.emailWarning ? (
            <p className="mt-2 font-semibold text-amber-900">{deliveryResult.emailWarning}</p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-2 flex items-center gap-1 text-[10px] text-violet-700/80">
        <KeyRound className="h-3 w-3" />
        MD, OD, and HR receive OTP by email. FM, EA, OM, TM, and RBAC staff get HR OTP here
        (first sign-in and password reset). {hqPasswordMinLength}+ character password + 2FA after
        setup.
      </p>
    </div>
  );
}
