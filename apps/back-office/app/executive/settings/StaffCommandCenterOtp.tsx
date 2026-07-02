'use client';

import { CheckCircle2, KeyRound, RefreshCw, Smartphone, Unlock } from 'lucide-react';

import { canExecutiveResetTargetTwoFactor } from '../../../lib/executive-portal-auth-policy';
import {
  executiveMissingRecoveryEmail,
  executiveRecoveryEmailDraft,
  maskRecoveryEmail,
} from '../../../lib/head-office-portal-recovery-email';
import { isExecutiveRank } from '../../../lib/portal-role-utils';
import { formatOtpChannelLabel } from '../../../lib/md-portal-staff-command-center-spec';
import type { StaffCommandCenterStaffRow } from './staff-command-center-actions';
import PortalOtpCountdown from './PortalOtpCountdown';

export type GeneratedOtpState = {
  emailed: boolean;
  otp?: string;
  emailWarning?: string;
  staffName: string;
  email: string;
  loginUsername?: string;
  expiresAt: number;
  otpLifetimeMs: number;
  provisionedBy: string;
  provisionedWhere: string;
  employeeId: string;
};

function formatPortalOtpAuditTime(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Intl.DateTimeFormat('en-LK', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function GeneratedOtpBanner({
  generatedOtp,
  onExpired,
}: {
  generatedOtp: GeneratedOtpState | null;
  onExpired: () => void;
}) {
  if (!generatedOtp) return null;

  return (
    <div className="border-b border-violet-100 bg-violet-50 px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-violet-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-violet-900">
            OTP for {generatedOtp.staffName} ({generatedOtp.email})
          </p>
          {generatedOtp.emailed ? (
            <p className="mt-2 text-sm font-semibold text-emerald-800">
              Code sent to work email. The 6-digit OTP is not shown here for security.
            </p>
          ) : generatedOtp.otp ? (
            <>
              <p className="mt-2 text-sm font-semibold text-violet-900">
                HR-desk OTP — share in person (not emailed):
              </p>
              <p className="mt-2 font-mono text-3xl font-black tracking-[0.35em] text-violet-900">
                {generatedOtp.otp}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-amber-800">
              OTP was issued but email delivery failed. Configure RESEND_API_KEY and
              PORTAL_EMAIL_FROM, then provision again.
            </p>
          )}
          {generatedOtp.emailWarning ? (
            <p className="mt-2 text-xs font-semibold text-amber-800">
              {generatedOtp.emailWarning}
            </p>
          ) : null}
          <p className="mt-2 text-xs font-semibold text-violet-800">
            Issued by {generatedOtp.provisionedBy} from {generatedOtp.provisionedWhere}.
            {generatedOtp.loginUsername ? (
              <> EPF {generatedOtp.loginUsername} on file ·</>
            ) : null}{' '}
            Staff sign in with work email + OTP, set a password, then bind 2FA.
          </p>
          <PortalOtpCountdown
            expiresAt={generatedOtp.expiresAt}
            lifetimeMs={generatedOtp.otpLifetimeMs}
            onExpired={onExpired}
          />
        </div>
      </div>
    </div>
  );
}

export function StaffCommandCenterOtpBlock({
  person,
  sessionEmployeeId,
  sessionRole,
  recoveryEmailDraft,
  onRecoveryEmailChange,
  generating,
  resettingAccess,
  resettingTwoFactor,
  unlocking,
  anyOtpBusy,
  onGenerateOtp,
  onResetAccess,
  onUnlockUsername,
  onResetTwoFactor,
}: {
  person: StaffCommandCenterStaffRow;
  sessionEmployeeId: string | null;
  sessionRole: string | null;
  recoveryEmailDraft: string;
  onRecoveryEmailChange: (value: string) => void;
  generating: boolean;
  resettingAccess: boolean;
  resettingTwoFactor: boolean;
  unlocking: boolean;
  anyOtpBusy: boolean;
  onGenerateOtp: () => void;
  onResetAccess: () => void;
  onUnlockUsername: () => void;
  onResetTwoFactor: () => void;
}) {
  const recoveryForGate = executiveRecoveryEmailDraft(
    { [person.id]: recoveryEmailDraft },
    person.id,
    person.portalAuth.recoveryEmail,
  );
  const missingExecutiveRecovery = executiveMissingRecoveryEmail(
    person.rank,
    recoveryForGate,
  );
  const otpPolicyLabel = formatOtpChannelLabel(person.securityPolicy);
  const canReset2fa = canExecutiveResetTargetTwoFactor(sessionRole, person.rank);

  const generateDisabled =
    !person.email ||
    missingExecutiveRecovery ||
    anyOtpBusy;

  const generateTitle = missingExecutiveRecovery
    ? sessionEmployeeId === person.id
      ? 'Set your recovery email in Recovery email above'
      : 'Set a recovery email before issuing OTP'
    : `Generate 6-digit OTP · ${otpPolicyLabel}`;

  return (
    <div className="space-y-3 rounded-xl border border-violet-200/60 bg-violet-50/30 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-violet-800">
        Portal OTP
      </p>

      {isExecutiveRank(person.rank) && sessionEmployeeId !== person.id ? (
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
            Recovery email
          </label>
          {person.portalAuth.recoveryEmail?.trim() ? (
            <p className="mt-1 font-mono text-[11px] font-semibold text-slate-700">
              {maskRecoveryEmail(person.portalAuth.recoveryEmail)}
            </p>
          ) : null}
          {missingExecutiveRecovery ? (
            <>
              <input
                type="email"
                value={recoveryEmailDraft}
                onChange={(event) => onRecoveryEmailChange(event.target.value)}
                autoComplete="off"
                placeholder="personal@gmail.com"
                className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50/50 px-2 py-1.5 text-[11px] text-slate-800"
              />
              <p className="mt-1 text-[10px] font-bold text-amber-800">
                Required before OTP — personal inbox, not work email. Saved when you generate OTP.
              </p>
            </>
          ) : (
            <p className="mt-1 text-[10px] text-slate-500">
              Executive can change from Recovery email after 2FA is enabled.
            </p>
          )}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200/70 bg-white/70 px-2.5 py-2 text-[10px] leading-relaxed text-slate-600">
        <p className="font-bold text-slate-800">
          Last OTP: {formatPortalOtpAuditTime(person.portalAuth.lastOtpProvisionedAt)}
        </p>
        {person.portalAuth.lastOtpProvisionedByName ? (
          <p className="mt-0.5">By {person.portalAuth.lastOtpProvisionedByName}</p>
        ) : null}
        {person.portalAuth.lastOtpProvisionedLocationLabel ? (
          <p className="text-slate-500">@ {person.portalAuth.lastOtpProvisionedLocationLabel}</p>
        ) : null}
        {person.portalAuth.isUsernameLocked ? (
          <p className="mt-1 font-bold text-rose-700">Username locked</p>
        ) : person.portalAuth.loginUsername ? (
          <p className="mt-0.5 text-slate-500">EPF {person.portalAuth.loginUsername}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onGenerateOtp}
          disabled={generateDisabled}
          title={generateTitle}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
          {generating ? '…' : `Generate OTP · ${otpPolicyLabel}`}
        </button>

        {person.portalAuth.isUsernameLocked ? (
          <button
            type="button"
            onClick={onUnlockUsername}
            disabled={anyOtpBusy && !unlocking}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Unlock className={`h-3 w-3 ${unlocking ? 'animate-pulse' : ''}`} />
            {unlocking ? '…' : 'Unlock user'}
          </button>
        ) : null}

        {person.portalAuth.twoFactorEnabled ? (
          <button
            type="button"
            onClick={onResetTwoFactor}
            disabled={!canReset2fa || !person.email || anyOtpBusy}
            title={!canReset2fa ? 'OD cannot reset MD 2FA' : undefined}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Smartphone className={`h-3 w-3 ${resettingTwoFactor ? 'animate-pulse' : ''}`} />
            {resettingTwoFactor ? '…' : 'Reset 2FA'}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onResetAccess}
          disabled={!person.email || anyOtpBusy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound className="h-3 w-3" />
          {resettingAccess ? '…' : 'Reset access'}
        </button>
      </div>
    </div>
  );
}
