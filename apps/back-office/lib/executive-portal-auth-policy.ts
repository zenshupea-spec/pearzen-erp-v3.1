import {
  HO_PORTAL_OTP_LIFETIME_MS,
  HO_PORTAL_PASSWORD_MIN_LENGTH,
  validateHeadOfficePortalPassword,
} from './head-office-portal-password';
import { HQ_STAFF_RANKS } from './portal-isolation';
import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';

/** MD/OD OTP validity — 5 minutes (see MD_PORTAL_IMPLEMENTATION_STEPS.md). */
export const EXECUTIVE_PORTAL_OTP_LIFETIME_MS = 5 * 60 * 1000;

export const EXECUTIVE_PORTAL_OTP_EXPIRES_MINUTES = 5;

/** Generic copy for `/login/md/request-code` — same for all outcomes (no enumeration). */
export const EXECUTIVE_PORTAL_ACCESS_CODE_SUCCESS_MESSAGE =
  'If your request was accepted, check your work email for further instructions.';

/** MD/OD permanent portal password minimum length (D2: minimum 30 + complexity). */
export const EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH = 30;

/** HQ Staff Portal (`/login/hq`) — same 30-character minimum as MD/OD. */
export const HQ_PORTAL_PASSWORD_MIN_LENGTH = 30;

export type PortalPasswordPolicyOptions = {
  rbacGated?: boolean;
};

/** HR, FM, EA — ranks that sign in at `/login/hq`. */
export function isHqStaffPortalRank(rank: string | null | undefined): boolean {
  const normalized = normalizePortalRole(rank);
  if (!normalized) return false;
  return (HQ_STAFF_RANKS as readonly string[]).includes(normalized);
}

export function usesHqPortalPasswordPolicy(
  rank: string | null | undefined,
  options?: PortalPasswordPolicyOptions,
): boolean {
  return isHqStaffPortalRank(rank) || Boolean(options?.rbacGated);
}

export const EXECUTIVE_PORTAL_OTP_EMAIL_FROM_DEFAULT =
  'Classic Venture Security <support@pearzen.tech>';

export function executivePortalOtpEmailFrom(): string {
  return (
    process.env.PORTAL_OTP_EMAIL_FROM?.trim() ||
    process.env.PORTAL_EMAIL_FROM?.trim() ||
    EXECUTIVE_PORTAL_OTP_EMAIL_FROM_DEFAULT
  );
}

/** Alias for MD/OD rank checks in portal auth policy. */
export function isExecutivePortalRank(rank: string | null | undefined): boolean {
  return isExecutiveRank(rank);
}

/** Self-service `/login/md/request-code` — MD/OD only; HQ/OM/TM are silently rejected. */
export function isEligibleExecutivePortalSelfServiceTarget(input: {
  employeeId: string | null | undefined;
  rank: string | null | undefined;
  authActive: boolean;
}): boolean {
  if (!input.employeeId || !input.authActive) return false;
  return isExecutivePortalRank(input.rank);
}

/**
 * Fields applied when an executive requests a forgot-password OTP.
 * Clears the portal password and 2FA so the user can set a new password and re-enroll.
 */
export function headOfficeForgotPasswordOtpResetFields(authRecord: {
  needs_pin_setup: boolean;
  pin_hash: string | null;
}): Record<string, unknown> {
  if (authRecord.needs_pin_setup || !authRecord.pin_hash) {
    return {};
  }

  return {
    pin_hash: null,
    unlock_code_hash: null,
    needs_pin_setup: true,
    totp_secret: null,
    two_factor_enabled: false,
    totp_backup_code_hashes: [],
    failed_2fa_attempts: 0,
  };
}

export function otpLifetimeMsForRank(rank: string | null | undefined): number {
  return isExecutivePortalRank(rank)
    ? EXECUTIVE_PORTAL_OTP_LIFETIME_MS
    : HO_PORTAL_OTP_LIFETIME_MS;
}

export function otpExpiresMinutesForRank(rank: string | null | undefined): number {
  return Math.round(otpLifetimeMsForRank(rank) / (60 * 1000));
}

export function passwordMinLengthForRank(
  rank: string | null | undefined,
  options?: PortalPasswordPolicyOptions,
): number {
  if (isExecutivePortalRank(rank)) {
    return EXECUTIVE_PORTAL_PASSWORD_MIN_LENGTH;
  }
  if (usesHqPortalPasswordPolicy(rank, options)) {
    return HQ_PORTAL_PASSWORD_MIN_LENGTH;
  }
  return HO_PORTAL_PASSWORD_MIN_LENGTH;
}

export function executivePortalPasswordHint(
  rank: string | null | undefined,
  options?: PortalPasswordPolicyOptions,
): string {
  const min = passwordMinLengthForRank(rank, options);
  return `At least ${min} characters with uppercase, lowercase, a number, and a symbol.`;
}

/** @deprecated Prefer executivePortalPasswordHint for rank-aware copy. */
export function headOfficePortalPasswordHint(rank: string | null | undefined): string {
  return executivePortalPasswordHint(rank);
}

export function headOfficeOtpExpiryHint(rank: string | null | undefined): string {
  const minutes = otpExpiresMinutesForRank(rank);
  return `Code expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export function validateHeadOfficePortalPasswordForRank(
  password: string,
  rank: string | null | undefined,
  options?: PortalPasswordPolicyOptions,
): { ok: true } | { ok: false; error: string } {
  return validateHeadOfficePortalPassword(password, {
    minLength: passwordMinLengthForRank(rank, options),
  });
}

/** MD may reset any Head Office 2FA; OD may reset staff but not MD. */
export function canExecutiveResetTargetTwoFactor(
  actorRank: string | null | undefined,
  targetRank: string | null | undefined,
): boolean {
  const actor = normalizePortalRole(actorRank);
  const target = normalizePortalRole(targetRank);
  if (actor === 'MD') return true;
  if (actor === 'OD') return target !== 'MD';
  return false;
}
