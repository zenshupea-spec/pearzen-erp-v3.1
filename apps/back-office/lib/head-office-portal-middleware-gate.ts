/**
 * Edge-safe Head Office portal gate helpers for middleware.
 * No Node.js `crypto` — session cookies use Web Crypto via head-office-portal-cookie-crypto.
 */
import type { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  decodeSignedPortalCookie,
} from './head-office-portal-cookie-crypto';
import type { BackOfficeUserProfile } from './hr-portal-access';
import {
  hasExecutiveRecoveryEmailOnRecord,
  requiresExecutiveRecoveryEmail,
} from './head-office-portal-recovery-email';
import {
  isHeadOfficePasswordChangePath,
  type PortalAccessGate,
} from './head-office-portal-gate-paths';
import { resolveHeadOfficePasswordExpiryContext } from './head-office-portal-password-expiry';
import {
  portalAuthEmailFromUsername,
} from './head-office-portal-username';

export type { PortalAccessGate };

export const HO_PORTAL_GEOFENCE_COOKIE = 'pz_ho_geo_session';
export const HO_PORTAL_2FA_COOKIE = 'pz_ho_2fa_session';
export const HO_PORTAL_TOTP_PENDING_COOKIE = 'pz_ho_totp_pending';
export const HO_PORTAL_PIN_COOKIE = 'pz_ho_pin_session';
export const HO_PORTAL_OTP_OK_COOKIE = 'pz_ho_otp_ok';

const PORTAL_2FA_COOKIE_DELIM = '|';

export type HeadOfficePortalAuthRecord = {
  employee_id: string;
  work_email: string;
  login_username: string | null;
  portal_auth_email: string | null;
  pin_hash: string | null;
  unlock_code_hash: string | null;
  current_otp: string | null;
  otp_expires_at: string | null;
  needs_pin_setup: boolean;
  is_active: boolean;
  two_factor_enabled: boolean;
  is_username_locked: boolean;
  locked_until: string | null;
  last_otp_provisioned_at: string | null;
  last_otp_provisioned_by_name: string | null;
  last_otp_provisioned_location_label: string | null;
  recovery_email: string | null;
  recovery_email_verified_at: string | null;
  password_changed_at: string | null;
  password_expires_at: string | null;
  must_change_password: boolean;
};

type PortalGateSessionReaders = {
  hasOtpSetupSession: () => Promise<boolean>;
  hasPinSession: () => Promise<boolean>;
  has2faSession: () => Promise<boolean>;
};

const HEAD_OFFICE_PORTAL_AUTH_SELECT =
  'employee_id, work_email, login_username, portal_auth_email, pin_hash, unlock_code_hash, current_otp, otp_expires_at, needs_pin_setup, is_active, two_factor_enabled, is_username_locked, locked_until, last_otp_provisioned_at, last_otp_provisioned_by_name, last_otp_provisioned_location_label, recovery_email, recovery_email_verified_at, password_changed_at, password_expires_at, must_change_password';

export function normalizeWorkEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapHeadOfficePortalAuthRow(data: Record<string, unknown>): HeadOfficePortalAuthRecord {
  return {
    employee_id: String(data.employee_id),
    work_email: String(data.work_email),
    login_username:
      typeof data.login_username === 'string' ? data.login_username : null,
    portal_auth_email:
      typeof data.portal_auth_email === 'string' ? data.portal_auth_email : null,
    pin_hash: typeof data.pin_hash === 'string' ? data.pin_hash : null,
    unlock_code_hash:
      typeof data.unlock_code_hash === 'string' ? data.unlock_code_hash : null,
    current_otp: typeof data.current_otp === 'string' ? data.current_otp : null,
    otp_expires_at:
      typeof data.otp_expires_at === 'string' ? data.otp_expires_at : null,
    needs_pin_setup: Boolean(data.needs_pin_setup),
    is_active: Boolean(data.is_active),
    two_factor_enabled: Boolean(data.two_factor_enabled),
    is_username_locked: Boolean(data.is_username_locked),
    locked_until:
      typeof data.locked_until === 'string' ? data.locked_until : null,
    last_otp_provisioned_at:
      typeof data.last_otp_provisioned_at === 'string'
        ? data.last_otp_provisioned_at
        : null,
    last_otp_provisioned_by_name:
      typeof data.last_otp_provisioned_by_name === 'string'
        ? data.last_otp_provisioned_by_name
        : null,
    last_otp_provisioned_location_label:
      typeof data.last_otp_provisioned_location_label === 'string'
        ? data.last_otp_provisioned_location_label
        : null,
    recovery_email:
      typeof data.recovery_email === 'string' ? normalizeWorkEmail(data.recovery_email) : null,
    recovery_email_verified_at:
      typeof data.recovery_email_verified_at === 'string'
        ? data.recovery_email_verified_at
        : null,
    password_changed_at:
      typeof data.password_changed_at === 'string'
        ? data.password_changed_at
        : null,
    password_expires_at:
      typeof data.password_expires_at === 'string'
        ? data.password_expires_at
        : null,
    must_change_password: Boolean(data.must_change_password),
  };
}

async function getHeadOfficePortalAuthByEmail(
  email: string,
): Promise<HeadOfficePortalAuthRecord | null> {
  const normalized = normalizeWorkEmail(email);
  if (!normalized) return null;

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('head_office_portal_auth')
    .select(HEAD_OFFICE_PORTAL_AUTH_SELECT)
    .or(`work_email.ilike.${normalized},portal_auth_email.ilike.${normalized}`)
    .maybeSingle();

  if (!data) return null;
  return mapHeadOfficePortalAuthRow(data as Record<string, unknown>);
}

function resolvePortalAuthEmail(
  authRecord: Pick<
    HeadOfficePortalAuthRecord,
    'portal_auth_email' | 'work_email' | 'login_username'
  >,
): string {
  if (authRecord.portal_auth_email) {
    return normalizeWorkEmail(authRecord.portal_auth_email);
  }
  if (authRecord.login_username) {
    return portalAuthEmailFromUsername(authRecord.login_username);
  }
  return normalizeWorkEmail(authRecord.work_email);
}

function portalSessionEmailMatches(
  authRecord: Pick<
    HeadOfficePortalAuthRecord,
    'portal_auth_email' | 'work_email' | 'login_username'
  >,
  email: string,
): boolean {
  const normalized = normalizeWorkEmail(email);
  if (!normalized) return false;
  if (normalizeWorkEmail(authRecord.work_email) === normalized) return true;
  return resolvePortalAuthEmail(authRecord) === normalized;
}

function portalSessionCookieEmailsMatch(
  tokenEmail: string,
  sessionEmail: string,
  authRecord: Pick<
    HeadOfficePortalAuthRecord,
    'portal_auth_email' | 'work_email' | 'login_username'
  > | null,
): boolean {
  if (normalizeWorkEmail(tokenEmail) === normalizeWorkEmail(sessionEmail)) {
    return true;
  }
  if (!authRecord) return false;
  return (
    portalSessionEmailMatches(authRecord, tokenEmail) &&
    portalSessionEmailMatches(authRecord, sessionEmail)
  );
}

async function portalSessionCookieEmailsMatchForSession(
  tokenEmail: string,
  sessionEmail: string,
): Promise<boolean> {
  if (normalizeWorkEmail(tokenEmail) === normalizeWorkEmail(sessionEmail)) {
    return true;
  }
  const authRecord = await getHeadOfficePortalAuthByEmail(sessionEmail);
  return portalSessionCookieEmailsMatch(tokenEmail, sessionEmail, authRecord);
}

function buildPortal2faSessionPayload(
  employeeId: string,
  email: string,
  authSignInAt: string,
): string {
  return `${employeeId}${PORTAL_2FA_COOKIE_DELIM}${normalizeWorkEmail(email)}${PORTAL_2FA_COOKIE_DELIM}${authSignInAt}`;
}

function parsePortal2faSessionPayload(payload: string): {
  employeeId: string;
  email: string;
  authSignInAt: string;
} | null {
  const parts = payload.split(PORTAL_2FA_COOKIE_DELIM);
  if (parts.length !== 3) return null;
  const [employeeId, email, authSignInAt] = parts;
  if (!employeeId || !email || !authSignInAt) return null;
  return { employeeId, email, authSignInAt };
}

function portal2faSessionMatches(
  employeeId: string,
  email: string,
  authSignInAt: string | null | undefined,
  parsed: { employeeId: string; email: string; authSignInAt: string },
): boolean {
  if (!authSignInAt) return false;
  return (
    parsed.employeeId === employeeId &&
    normalizeWorkEmail(parsed.email) === normalizeWorkEmail(email) &&
    parsed.authSignInAt === authSignInAt
  );
}

async function hasValidPortal2faSession(
  req: NextRequest,
  employeeId: string,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<boolean> {
  const token = req.cookies.get(HO_PORTAL_2FA_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const parsed = parsePortal2faSessionPayload(payload);
  if (!parsed) return false;
  return portal2faSessionMatches(employeeId, email, authSignInAt, parsed);
}

async function hasValidPortalPinSession(
  req: NextRequest,
  employeeId: string,
  email: string,
): Promise<boolean> {
  const token = req.cookies.get(HO_PORTAL_PIN_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(':');
  const exp = Number(expRaw);
  if (
    tokenEmployeeId !== employeeId ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }
  return portalSessionCookieEmailsMatchForSession(tokenEmail, email);
}

async function hasValidOtpSetupSession(
  req: NextRequest,
  employeeId: string,
  email: string,
): Promise<boolean> {
  const token = req.cookies.get(HO_PORTAL_OTP_OK_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(':');
  const exp = Number(expRaw);
  if (
    tokenEmployeeId !== employeeId ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }
  return portalSessionCookieEmailsMatchForSession(tokenEmail, email);
}

function isHeadOfficeAccountSecurityPath(pathname: string): boolean {
  return pathname === '/account/security' || pathname.startsWith('/account/security/');
}

async function resolvePortalAccessGateForPathname(
  profile: BackOfficeUserProfile,
  userEmail: string,
  pathname: string,
  readers: PortalGateSessionReaders,
  authRecord: HeadOfficePortalAuthRecord,
): Promise<PortalAccessGate> {
  if (
    requiresExecutiveRecoveryEmail(profile.role) &&
    !hasExecutiveRecoveryEmailOnRecord(authRecord)
  ) {
    return 'not_provisioned';
  }

  if (authRecord.needs_pin_setup) {
    if (pathname === '/login/set-pin') {
      const otpOk = await readers.hasOtpSetupSession();
      return otpOk ? 'ok' : 'setup_sign_in';
    }
    if (await readers.hasOtpSetupSession()) {
      return 'set_pin';
    }
    return 'setup_sign_in';
  }

  if (!authRecord.two_factor_enabled) {
    if (
      pathname === '/login/setup-2fa' ||
      isHeadOfficeAccountSecurityPath(pathname)
    ) {
      return (await readers.hasPinSession()) ? 'ok' : 'verify_pin';
    }
    return 'setup_2fa';
  }

  if (!(await readers.has2faSession())) {
    if (pathname === '/login/verify-2fa' || pathname === '/login/recover-2fa') {
      return 'ok';
    }
    if (
      isHeadOfficeAccountSecurityPath(pathname) &&
      (await readers.hasPinSession())
    ) {
      return 'ok';
    }
    if (!(await readers.hasPinSession())) {
      return 'verify_pin';
    }
    return 'verify_2fa';
  }

  if (!authRecord.unlock_code_hash) {
    if (
      pathname === '/login/set-unlock-code' ||
      pathname === '/login/reset-unlock-code' ||
      pathname === '/login/setup-2fa'
    ) {
      return 'ok';
    }
    return 'setup_unlock_code';
  }

  if (!authRecord.needs_pin_setup) {
    const passwordExpiry = resolveHeadOfficePasswordExpiryContext(authRecord);
    if (passwordExpiry.isPasswordExpired) {
      if (isHeadOfficePasswordChangePath(pathname)) {
        return (await readers.hasPinSession()) ? 'ok' : 'verify_pin';
      }
      if (!(await readers.hasPinSession())) {
        return 'verify_pin';
      }
      return 'change_password';
    }
  }

  if (await readers.hasPinSession()) {
    return 'ok';
  }

  if (pathname === '/login/set-pin') return 'verify_pin';
  return 'verify_pin';
}

export function requiresHeadOfficePortalPin(
  profile: BackOfficeUserProfile,
  userEmail: string | null | undefined,
): boolean {
  if (!profile.employeeId || !userEmail) return false;
  const email = normalizeWorkEmail(userEmail);
  if (!email) return false;
  if (email.endsWith('@pearzen.sm')) return false;
  if (email.endsWith('@shalom.pearzen.local')) return false;
  if (email.endsWith('@portal.pearzen.local')) return true;
  if (email.endsWith('@pearzen.cafe')) return false;
  if (email.endsWith('@pearzen.local')) return false;
  return true;
}

export async function hasValidHeadOfficeGeofenceSession(
  req: NextRequest,
  employeeId: string,
  email: string,
): Promise<boolean> {
  const token = req.cookies.get(HO_PORTAL_GEOFENCE_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(':');
  const exp = Number(expRaw);
  if (
    tokenEmployeeId !== employeeId ||
    normalizeWorkEmail(tokenEmail) !== normalizeWorkEmail(email) ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }
  return true;
}

function clearHeadOfficeGeofenceSessionCookies(response: NextResponse): void {
  response.cookies.delete(HO_PORTAL_GEOFENCE_COOKIE);
}

function clearPortal2faSessionCookies(response: NextResponse): void {
  response.cookies.delete(HO_PORTAL_2FA_COOKIE);
  response.cookies.delete(HO_PORTAL_TOTP_PENDING_COOKIE);
}

export function clearPortalPinSessionCookies(response: NextResponse): void {
  response.cookies.delete(HO_PORTAL_PIN_COOKIE);
  response.cookies.delete(HO_PORTAL_OTP_OK_COOKIE);
  clearHeadOfficeGeofenceSessionCookies(response);
  clearPortal2faSessionCookies(response);
}

export function isPortalPinExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/')
  );
}

export async function resolvePortalAccessGate(
  req: NextRequest,
  profile: BackOfficeUserProfile,
  userEmail: string | null | undefined,
  authSignInAt?: string | null,
): Promise<PortalAccessGate> {
  if (!requiresHeadOfficePortalPin(profile, userEmail)) return 'ok';
  if (!profile.employeeId) return 'not_provisioned';

  const authRecord = await getHeadOfficePortalAuthByEmail(userEmail!);
  if (!authRecord || !authRecord.is_active) {
    return !authRecord ? 'not_provisioned' : 'revoked';
  }

  const { pathname } = req.nextUrl;

  return resolvePortalAccessGateForPathname(
    profile,
    userEmail!,
    pathname,
    {
      hasOtpSetupSession: () =>
        hasValidOtpSetupSession(req, profile.employeeId!, userEmail!),
      hasPinSession: () =>
        hasValidPortalPinSession(req, profile.employeeId!, userEmail!),
      has2faSession: () =>
        hasValidPortal2faSession(
          req,
          profile.employeeId!,
          userEmail!,
          authSignInAt,
        ),
    },
    authRecord,
  );
}
