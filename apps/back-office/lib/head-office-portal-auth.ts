import type { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "../../../packages/supabase/service";
import { buildAuthTenantAppMetadata } from "../../../packages/supabase/auth-tenant-metadata";
import {
  decodeSignedPortalCookie,
  encodeSignedPortalCookie,
} from "./head-office-portal-cookie-crypto";
import type { BackOfficeUserProfile } from "./hr-portal-access";
import {
  authenticatedLandingPath,
  fetchEmployeePortalProfileByEmployeeId,
} from "./hr-portal-access";
import { loginPathForRole, staffPortalIdForRole } from "./portal-isolation";
import {
  HO_PORTAL_OTP_LENGTH,
  isHeadOfficeOtpCode,
} from "./head-office-portal-password";
import {
  isExecutivePortalRank,
  otpExpiresMinutesForRank,
  otpLifetimeMsForRank,
  validateHeadOfficePortalPasswordForRank,
  receivesWorkEmailOtpOnProvision,
} from "./executive-portal-auth-policy";
import {
  hasExecutiveRecoveryEmailOnRecord,
  requiresExecutiveRecoveryEmail,
  validateExecutiveRecoveryEmail,
} from "./head-office-portal-recovery-email";
import { validateHeadOfficePortalPasswordRotation } from "./portal-password-rotation";
import {
  computePasswordExpiresAt,
  fetchPortalPasswordHistoryHashes,
  recordPasswordHistory,
  clearPortalPasswordHistory,
} from "../../../packages/supabase/portal-password-rotation";
import { resolveHeadOfficePasswordExpiryContext } from "./head-office-portal-password-expiry";
import { isHeadOfficePasswordChangePath, HEAD_OFFICE_PASSWORD_CHANGE_PATH } from "./head-office-portal-gate-paths";
import { sendHeadOfficePortalOtpEmail, headOfficePortalOtpLabel } from "./head-office-portal-email";
import {
  generateHeadOfficeBackupCodes,
  hashHeadOfficeBackupCode,
  HEAD_OFFICE_NO_BACKUP_CODES_ERROR,
  isHeadOfficeBackupCodeInput,
  verifyHeadOfficeBackupCode,
} from "./head-office-totp-backup";
import {
  generateHeadOfficeTotpSecret,
  verifyHeadOfficeTotpCode,
  buildHeadOfficeTotpUri,
  encryptHeadOfficeTotpSecret,
  isEncryptedHeadOfficeTotpSecret,
  resolveHeadOfficeTotpSecret,
} from "./head-office-totp";
import {
  portalAuthEmailFromUsername,
  normalizePortalLoginUsername,
  parsePortalLoginIdentifier,
} from "./head-office-portal-username";
import { notifyExecutivesOfOtpProvision } from "./head-office-portal-notifications";
import { recordHeadOfficeOtpProvisionEvents, recordPortalLoginEvent } from "./portal-login-events";
import {
  assertPortalLoginNotLocked,
  clearPortalLoginFailures,
  recordPortal2faFailure,
  recordPortalPasswordFailure,
  startHeadOfficeOd2faRecoveryLockout,
} from "./head-office-portal-lockout";
import { decryptEmployeePiiRecord } from "./employee-pii";
import {
  buildDailySignoutRedirectPath,
  isSignInBeforeLatestColomboMidnight,
} from "./portal-sl-midnight";
import {
  hashPortalUnlockCode,
  validatePortalUnlockCode,
  verifyPortalUnlockCode,
} from "./head-office-unlock-code";
import type { PortalAccessGate } from "./head-office-portal-gate-paths";

export type { PortalAccessGate } from "./head-office-portal-gate-paths";
export { headOfficePortalGateRedirectPath } from "./head-office-portal-gate-paths";

export {
  HO_PORTAL_OTP_LENGTH,
  HO_PORTAL_OTP_LIFETIME_MS,
  HO_PORTAL_PASSWORD_MIN_LENGTH,
  HO_PORTAL_PASSWORD_HINT,
  HO_PORTAL_PIN_LENGTH,
  isHeadOfficeOtpCode,
  validateHeadOfficePortalPassword,
} from "./head-office-portal-password";

export const HO_PORTAL_GEOFENCE_COOKIE = "pz_ho_geo_session";
export const HO_PORTAL_2FA_COOKIE = "pz_ho_2fa_session";
export const HO_PORTAL_TOTP_PENDING_COOKIE = "pz_ho_totp_pending";
export const HO_PORTAL_PIN_COOKIE = "pz_ho_pin_session";
export const HO_PORTAL_OTP_OK_COOKIE = "pz_ho_otp_ok";

const PIN_ITERATIONS = 100_000;
const PIN_SESSION_MS = 12 * 60 * 60 * 1000;
const OTP_OK_MS = 10 * 60 * 1000;
/** Upper bound for 2FA cookie lifetime; validity is tied to the current Supabase sign-in. */
const PORTAL_2FA_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;
const PORTAL_2FA_COOKIE_DELIM = "|";

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

export type HeadOfficePortalAuthStatus = {
  isProvisioned: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  isUsernameLocked: boolean;
  loginUsername: string | null;
  lastOtpProvisionedAt: string | null;
  lastOtpProvisionedByName: string | null;
  lastOtpProvisionedLocationLabel: string | null;
  recoveryEmail: string | null;
  recoveryEmailVerifiedAt: string | null;
};

type PortalGateSessionReaders = {
  hasOtpSetupSession: () => Promise<boolean>;
  hasPinSession: () => Promise<boolean>;
  has2faSession: () => Promise<boolean>;
};

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
    return "not_provisioned";
  }

  if (authRecord.needs_pin_setup) {
    if (pathname === "/login/set-pin") {
      const otpOk = await readers.hasOtpSetupSession();
      return otpOk ? "ok" : "setup_sign_in";
    }
    if (await readers.hasOtpSetupSession()) {
      return "set_pin";
    }
    return "setup_sign_in";
  }

  if (!authRecord.two_factor_enabled) {
    if (
      pathname === "/login/setup-2fa" ||
      isHeadOfficeAccountSecurityPath(pathname)
    ) {
      return (await readers.hasPinSession()) ? "ok" : "verify_pin";
    }
    return "setup_2fa";
  }

  if (!(await readers.has2faSession())) {
    if (pathname === "/login/verify-2fa" || pathname === "/login/recover-2fa") {
      return "ok";
    }
    if (
      isHeadOfficeAccountSecurityPath(pathname) &&
      (await readers.hasPinSession())
    ) {
      return "ok";
    }
    if (!(await readers.hasPinSession())) {
      return "verify_pin";
    }
    return "verify_2fa";
  }

  if (!authRecord.unlock_code_hash) {
    if (
      pathname === "/login/set-unlock-code" ||
      pathname === "/login/reset-unlock-code" ||
      pathname === "/login/setup-2fa"
    ) {
      return "ok";
    }
    return "setup_unlock_code";
  }

  if (!authRecord.needs_pin_setup) {
    const passwordExpiry = resolveHeadOfficePasswordExpiryContext(authRecord);
    if (passwordExpiry.isPasswordExpired) {
      if (isHeadOfficePasswordChangePath(pathname)) {
        return (await readers.hasPinSession()) ? "ok" : "verify_pin";
      }
      if (!(await readers.hasPinSession())) {
        return "verify_pin";
      }
      return "change_password";
    }
  }

  if (await readers.hasPinSession()) {
    return "ok";
  }

  if (pathname === "/login/set-pin") return "verify_pin";
  return "verify_pin";
}

export async function resolvePortalAccessGateFromCookies(
  profile: BackOfficeUserProfile,
  userEmail: string,
  authSignInAt: string | null | undefined,
  pathname: string,
): Promise<PortalAccessGate> {
  if (!requiresHeadOfficePortalPin(profile, userEmail)) return "ok";
  if (!profile.employeeId) return "not_provisioned";

  const authRecord = await getHeadOfficePortalAuthByEmail(userEmail);
  if (!authRecord || !authRecord.is_active) {
    return !authRecord ? "not_provisioned" : "revoked";
  }

  return resolvePortalAccessGateForPathname(
    profile,
    userEmail,
    pathname,
    {
      hasOtpSetupSession: () =>
        hasValidOtpSetupSessionForUser(profile.employeeId!, userEmail),
      hasPinSession: () =>
        hasValidPortalPinSessionForUser(profile.employeeId!, userEmail),
      has2faSession: () =>
        hasValidPortal2faSessionForUser(
          profile.employeeId!,
          userEmail,
          authSignInAt,
        ),
    },
    authRecord,
  );
}

export function normalizeWorkEmail(email: string): string {
  return email.trim().toLowerCase();
}

const HEAD_OFFICE_PORTAL_AUTH_SELECT =
  "employee_id, work_email, login_username, portal_auth_email, pin_hash, unlock_code_hash, current_otp, otp_expires_at, needs_pin_setup, is_active, two_factor_enabled, is_username_locked, locked_until, last_otp_provisioned_at, last_otp_provisioned_by_name, last_otp_provisioned_location_label, recovery_email, recovery_email_verified_at, password_changed_at, password_expires_at, must_change_password";

function mapHeadOfficePortalAuthRow(data: Record<string, unknown>): HeadOfficePortalAuthRecord {
  return {
    employee_id: String(data.employee_id),
    work_email: String(data.work_email),
    login_username:
      typeof data.login_username === "string" ? data.login_username : null,
    portal_auth_email:
      typeof data.portal_auth_email === "string" ? data.portal_auth_email : null,
    pin_hash: typeof data.pin_hash === "string" ? data.pin_hash : null,
    unlock_code_hash:
      typeof data.unlock_code_hash === "string" ? data.unlock_code_hash : null,
    current_otp: typeof data.current_otp === "string" ? data.current_otp : null,
    otp_expires_at:
      typeof data.otp_expires_at === "string" ? data.otp_expires_at : null,
    needs_pin_setup: Boolean(data.needs_pin_setup),
    is_active: Boolean(data.is_active),
    two_factor_enabled: Boolean(data.two_factor_enabled),
    is_username_locked: Boolean(data.is_username_locked),
    locked_until:
      typeof data.locked_until === "string" ? data.locked_until : null,
    last_otp_provisioned_at:
      typeof data.last_otp_provisioned_at === "string"
        ? data.last_otp_provisioned_at
        : null,
    last_otp_provisioned_by_name:
      typeof data.last_otp_provisioned_by_name === "string"
        ? data.last_otp_provisioned_by_name
        : null,
    last_otp_provisioned_location_label:
      typeof data.last_otp_provisioned_location_label === "string"
        ? data.last_otp_provisioned_location_label
        : null,
    recovery_email:
      typeof data.recovery_email === "string" ? normalizeWorkEmail(data.recovery_email) : null,
    recovery_email_verified_at:
      typeof data.recovery_email_verified_at === "string"
        ? data.recovery_email_verified_at
        : null,
    password_changed_at:
      typeof data.password_changed_at === "string"
        ? data.password_changed_at
        : null,
    password_expires_at:
      typeof data.password_expires_at === "string"
        ? data.password_expires_at
        : null,
    must_change_password: Boolean(data.must_change_password),
  };
}

export function resolvePortalAuthEmail(
  authRecord: Pick<
    HeadOfficePortalAuthRecord,
    "portal_auth_email" | "work_email" | "login_username"
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

/** True when Supabase session email matches this portal auth row (NIC alias or work email). */
export function portalSessionEmailMatches(
  authRecord: Pick<
    HeadOfficePortalAuthRecord,
    "portal_auth_email" | "work_email" | "login_username"
  >,
  email: string,
): boolean {
  const normalized = normalizeWorkEmail(email);
  if (!normalized) return false;
  if (normalizeWorkEmail(authRecord.work_email) === normalized) return true;
  return resolvePortalAuthEmail(authRecord) === normalized;
}

/** Pin/OTP session cookies may store work email or portal auth email — both are valid. */
export function portalSessionCookieEmailsMatch(
  tokenEmail: string,
  sessionEmail: string,
  authRecord: Pick<
    HeadOfficePortalAuthRecord,
    "portal_auth_email" | "work_email" | "login_username"
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

export function isHeadOfficeOtpValid(
  authRecord: Pick<HeadOfficePortalAuthRecord, "current_otp" | "otp_expires_at">,
): boolean {
  if (!authRecord.current_otp || !authRecord.otp_expires_at) return false;
  return Date.now() < new Date(authRecord.otp_expires_at).getTime();
}

async function findSupabaseAuthUserIdByEmail(
  email: string,
): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const normalized = normalizeWorkEmail(email);
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) return null;

    const found = data.users.find(
      (user) => normalizeWorkEmail(user.email ?? "") === normalized,
    );
    if (found) return found.id;

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function syncHeadOfficeSupabaseAuthPassword(
  workEmail: string,
  password: string,
  metadata?: { employeeId?: string; fullName?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const email = normalizeWorkEmail(workEmail);
  if (!email) return { ok: false, error: "Work email is required." };

  const service = createSupabaseServiceClient();
  const userMetadata: Record<string, string> = {};
  if (metadata?.employeeId) userMetadata.employee_id = metadata.employeeId;
  if (metadata?.fullName) userMetadata.full_name = metadata.fullName;

  let appMetadata: Record<string, string> = {};
  if (metadata?.employeeId) {
    const { data: emp } = await service
      .from("employees")
      .select("company_id")
      .eq("id", metadata.employeeId)
      .maybeSingle();
    if (emp?.company_id) {
      appMetadata = buildAuthTenantAppMetadata(String(emp.company_id));
    }
  }

  const existingId = await findSupabaseAuthUserIdByEmail(email);
  if (existingId) {
    const { data: existingUser } = await service.auth.admin.getUserById(existingId);
    const mergedAppMetadata = {
      ...(existingUser.user?.app_metadata ?? {}),
      ...appMetadata,
    };
    const { error } = await service.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
      ...(Object.keys(userMetadata).length > 0
        ? { user_metadata: userMetadata }
        : {}),
      ...(Object.keys(mergedAppMetadata).length > 0
        ? { app_metadata: mergedAppMetadata }
        : {}),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(Object.keys(userMetadata).length > 0
      ? { user_metadata: userMetadata }
      : {}),
    ...(Object.keys(appMetadata).length > 0 ? { app_metadata: appMetadata } : {}),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requiresHeadOfficePortalPin(
  profile: BackOfficeUserProfile,
  userEmail: string | null | undefined,
): boolean {
  if (!profile.employeeId || !userEmail) return false;
  const email = normalizeWorkEmail(userEmail);
  if (!email) return false;
  if (email.endsWith("@pearzen.sm")) return false;
  if (email.endsWith("@shalom.pearzen.local")) return false;
  if (email.endsWith("@portal.pearzen.local")) return true;
  if (email.endsWith("@pearzen.cafe")) return false;
  if (email.endsWith("@pearzen.local")) return false;
  return true;
}

export async function getHeadOfficePortalAuthByEmail(
  email: string,
): Promise<HeadOfficePortalAuthRecord | null> {
  const normalized = normalizeWorkEmail(email);
  if (!normalized) return null;

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select(HEAD_OFFICE_PORTAL_AUTH_SELECT)
    .or(`work_email.ilike.${normalized},portal_auth_email.ilike.${normalized}`)
    .maybeSingle();

  if (!data) return null;
  return mapHeadOfficePortalAuthRow(data as Record<string, unknown>);
}

export async function getHeadOfficePortalAuthByLoginUsername(
  username: string,
): Promise<HeadOfficePortalAuthRecord | null> {
  const normalized = normalizePortalLoginUsername(username);
  if (!normalized) return null;

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select(HEAD_OFFICE_PORTAL_AUTH_SELECT)
    .eq("login_username", normalized)
    .maybeSingle();

  if (!data) return null;
  return mapHeadOfficePortalAuthRow(data as Record<string, unknown>);
}

export async function getHeadOfficePortalAuthByIdentifier(
  raw: string,
): Promise<HeadOfficePortalAuthRecord | null> {
  const parsed = parsePortalLoginIdentifier(raw);
  if (!parsed) return null;
  if (parsed.kind === "email") {
    return getHeadOfficePortalAuthByEmail(parsed.value);
  }
  return getHeadOfficePortalAuthByLoginUsername(parsed.value);
}

export async function resolveEmployeePortalNic(
  employeeId: string,
): Promise<{ ok: boolean; nic?: string; error?: string }> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("employees")
    .select("epf_no, emp_number, nic")
    .eq("id", employeeId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Employee not found." };
  }

  const decrypted = decryptEmployeePiiRecord(
    data as Record<string, unknown>,
  ) as { epf_no?: unknown; emp_number?: unknown; nic?: unknown };

  for (const candidate of [decrypted.epf_no, decrypted.emp_number, decrypted.nic]) {
    const loginKey = normalizePortalLoginUsername(candidate);
    if (loginKey) {
      return { ok: true, nic: loginKey };
    }
  }

  return {
    ok: false,
    error: "Set EPF number on the MNR record before provisioning portal access.",
  };
}

async function resolveEmployeePortalRank(
  employeeId: string,
): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("employees")
    .select("rank")
    .eq("id", employeeId)
    .maybeSingle();

  if (!data || typeof data.rank !== "string") return null;
  return data.rank.trim() || null;
}

async function resolvePortalPasswordPolicyContext(employeeId: string): Promise<{
  rank: string | null;
  rbacGated?: boolean;
}> {
  const profile = await fetchEmployeePortalProfileByEmployeeId(employeeId);
  return {
    rank: profile?.role ?? (await resolveEmployeePortalRank(employeeId)),
    rbacGated: profile?.rbacGated,
  };
}

export async function backfillHeadOfficePortalNicFields(
  employeeId: string,
): Promise<{
  ok: boolean;
  loginUsername?: string;
  portalAuthEmail?: string;
  error?: string;
}> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }

  if (authRecord.login_username && authRecord.portal_auth_email) {
    return {
      ok: true,
      loginUsername: authRecord.login_username,
      portalAuthEmail: authRecord.portal_auth_email,
    };
  }

  const nicResult = await resolveEmployeePortalNic(employeeId);
  if (!nicResult.ok || !nicResult.nic) {
    return { ok: false, error: nicResult.error ?? "EPF number is required." };
  }

  const loginUsername = nicResult.nic;
  const portalAuthEmail = portalAuthEmailFromUsername(loginUsername);
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      login_username: loginUsername,
      portal_auth_email: portalAuthEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, loginUsername, portalAuthEmail };
}

export async function getHeadOfficePortalAuthByEmployeeId(
  employeeId: string,
): Promise<HeadOfficePortalAuthRecord | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select(HEAD_OFFICE_PORTAL_AUTH_SELECT)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (!data) return null;
  return mapHeadOfficePortalAuthRow(data as Record<string, unknown>);
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

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(":");
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

export async function hasValidHeadOfficeGeofenceSessionForUser(
  employeeId: string,
  email: string,
): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(HO_PORTAL_GEOFENCE_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(":");
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

export async function attachHeadOfficeGeofenceSessionCookie(
  response: NextResponse,
  employeeId: string,
  email: string,
): Promise<void> {
  const exp = Date.now() + PIN_SESSION_MS;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  response.cookies.set(
    HO_PORTAL_GEOFENCE_COOKIE,
    await encodeSignedPortalCookie(payload),
    {
      ...cookieBase,
      maxAge: Math.floor(PIN_SESSION_MS / 1000),
    },
  );
}

export async function setHeadOfficeGeofenceSessionCookies(
  employeeId: string,
  email: string,
): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const exp = Date.now() + PIN_SESSION_MS;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  cookieStore.set(
    HO_PORTAL_GEOFENCE_COOKIE,
    await encodeSignedPortalCookie(payload),
    {
      ...cookieBase,
      maxAge: Math.floor(PIN_SESSION_MS / 1000),
    },
  );
}

export function clearHeadOfficeGeofenceSessionCookies(response: NextResponse): void {
  response.cookies.delete(HO_PORTAL_GEOFENCE_COOKIE);
}

export async function clearHeadOfficeGeofenceSessionCookiesStore(): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete(HO_PORTAL_GEOFENCE_COOKIE);
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

async function getAuthenticatedSignInAt(): Promise<string | null> {
  const { createSupabaseServerClient } = await import(
    "../../../packages/supabase/server"
  );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.last_sign_in_at ?? null;
}

export async function hasValidPortal2faSession(
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

export async function hasValidPortal2faSessionForUser(
  employeeId: string,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(HO_PORTAL_2FA_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const parsed = parsePortal2faSessionPayload(payload);
  if (!parsed) return false;
  return portal2faSessionMatches(employeeId, email, authSignInAt, parsed);
}

export async function setPortal2faSessionCookies(
  employeeId: string,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<void> {
  if (!authSignInAt) return;

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const payload = buildPortal2faSessionPayload(employeeId, email, authSignInAt);
  cookieStore.set(HO_PORTAL_2FA_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: PORTAL_2FA_COOKIE_MAX_AGE_SEC,
  });
}

export function clearPortal2faSessionCookies(response: NextResponse): void {
  response.cookies.delete(HO_PORTAL_2FA_COOKIE);
  response.cookies.delete(HO_PORTAL_TOTP_PENDING_COOKIE);
}

export async function clearPortal2faSessionCookiesStore(): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete(HO_PORTAL_2FA_COOKIE);
  cookieStore.delete(HO_PORTAL_TOTP_PENDING_COOKIE);
}

export function isHeadOfficeAccountSecurityPath(pathname: string): boolean {
  return pathname === "/account/security" || pathname.startsWith("/account/security/");
}

export async function hasValidPortalPinSession(
  req: NextRequest,
  employeeId: string,
  email: string,
): Promise<boolean> {
  const token = req.cookies.get(HO_PORTAL_PIN_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(":");
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

export async function hasValidOtpSetupSession(
  req: NextRequest,
  employeeId: string,
  email: string,
): Promise<boolean> {
  const token = req.cookies.get(HO_PORTAL_OTP_OK_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(":");
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

export async function hasValidPortalPinSessionForUser(
  employeeId: string,
  email: string,
): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(HO_PORTAL_PIN_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(":");
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

export async function hasValidOtpSetupSessionForUser(
  employeeId: string,
  email: string,
): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const token = cookieStore.get(HO_PORTAL_OTP_OK_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmployeeId, tokenEmail, expRaw] = payload.split(":");
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

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function attachPortalPinSessionCookie(
  response: NextResponse,
  employeeId: string,
  email: string,
): Promise<void> {
  const exp = Date.now() + PIN_SESSION_MS;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  response.cookies.set(HO_PORTAL_PIN_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: Math.floor(PIN_SESSION_MS / 1000),
  });
  response.cookies.delete(HO_PORTAL_OTP_OK_COOKIE);
}

export async function attachOtpSetupSessionCookie(
  response: NextResponse,
  employeeId: string,
  email: string,
): Promise<void> {
  const exp = Date.now() + OTP_OK_MS;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  response.cookies.set(HO_PORTAL_OTP_OK_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: Math.floor(OTP_OK_MS / 1000),
  });
}

export function clearPortalPinSessionCookies(response: NextResponse): void {
  response.cookies.delete(HO_PORTAL_PIN_COOKIE);
  response.cookies.delete(HO_PORTAL_OTP_OK_COOKIE);
  clearHeadOfficeGeofenceSessionCookies(response);
  clearPortal2faSessionCookies(response);
}

/** Server Actions / Route Handlers — uses next/headers cookies(). */
export async function setPortalPinSessionCookies(
  employeeId: string,
  email: string,
): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const exp = Date.now() + PIN_SESSION_MS;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  cookieStore.set(HO_PORTAL_PIN_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: Math.floor(PIN_SESSION_MS / 1000),
  });
  cookieStore.delete(HO_PORTAL_OTP_OK_COOKIE);
}

export async function setOtpSetupSessionCookies(
  employeeId: string,
  email: string,
): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const exp = Date.now() + OTP_OK_MS;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  cookieStore.set(HO_PORTAL_OTP_OK_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: Math.floor(OTP_OK_MS / 1000),
  });
}

export async function clearPortalPinSessionCookiesStore(): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete(HO_PORTAL_PIN_COOKIE);
  cookieStore.delete(HO_PORTAL_OTP_OK_COOKIE);
  cookieStore.delete(HO_PORTAL_GEOFENCE_COOKIE);
  cookieStore.delete(HO_PORTAL_2FA_COOKIE);
  cookieStore.delete(HO_PORTAL_TOTP_PENDING_COOKIE);
}

export function isPortalPinExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/")
  );
}

export async function getHeadOfficePortalAuthStatusesForEmployees(
  employeeIds: string[],
): Promise<Record<string, HeadOfficePortalAuthStatus>> {
  if (employeeIds.length === 0) return {};

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select(
      "employee_id, is_active, two_factor_enabled, is_username_locked, login_username, last_otp_provisioned_at, last_otp_provisioned_by_name, last_otp_provisioned_location_label, recovery_email, recovery_email_verified_at",
    )
    .in("employee_id", employeeIds);

  const out: Record<string, HeadOfficePortalAuthStatus> = {};
  for (const id of employeeIds) {
    out[id] = {
      isProvisioned: false,
      isActive: false,
      twoFactorEnabled: false,
      isUsernameLocked: false,
      loginUsername: null,
      lastOtpProvisionedAt: null,
      lastOtpProvisionedByName: null,
      lastOtpProvisionedLocationLabel: null,
      recoveryEmail: null,
      recoveryEmailVerifiedAt: null,
    };
  }

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const employeeId = String(record.employee_id);
    out[employeeId] = {
      isProvisioned: true,
      isActive: Boolean(record.is_active),
      twoFactorEnabled: Boolean(record.two_factor_enabled),
      isUsernameLocked: Boolean(record.is_username_locked),
      loginUsername:
        typeof record.login_username === "string" ? record.login_username : null,
      lastOtpProvisionedAt:
        typeof record.last_otp_provisioned_at === "string"
          ? record.last_otp_provisioned_at
          : null,
      lastOtpProvisionedByName:
        typeof record.last_otp_provisioned_by_name === "string"
          ? record.last_otp_provisioned_by_name
          : null,
      lastOtpProvisionedLocationLabel:
        typeof record.last_otp_provisioned_location_label === "string"
          ? record.last_otp_provisioned_location_label
          : null,
      recoveryEmail:
        typeof record.recovery_email === "string"
          ? normalizeWorkEmail(record.recovery_email)
          : null,
      recoveryEmailVerifiedAt:
        typeof record.recovery_email_verified_at === "string"
          ? record.recovery_email_verified_at
          : null,
    };
  }

  return out;
}

export async function resolvePortalAccessGate(
  req: NextRequest,
  profile: BackOfficeUserProfile,
  userEmail: string | null | undefined,
  authSignInAt?: string | null,
): Promise<PortalAccessGate> {
  if (!requiresHeadOfficePortalPin(profile, userEmail)) return "ok";
  if (!profile.employeeId) return "not_provisioned";

  const authRecord = await getHeadOfficePortalAuthByEmail(userEmail!);
  if (!authRecord || !authRecord.is_active) {
    return !authRecord ? "not_provisioned" : "revoked";
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

/** Where an authenticated Head Office user should land (PIN + 2FA gates). */
export async function resolveHeadOfficePortalEntryPath(
  profile: BackOfficeUserProfile,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<string> {
  if (isSignInBeforeLatestColomboMidnight(authSignInAt)) {
    return buildDailySignoutRedirectPath(profile);
  }

  if (!requiresHeadOfficePortalPin(profile, email)) {
    return authenticatedLandingPath(profile.role, profile);
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(email);
  if (!authRecord || !authRecord.is_active) {
    return loginPathForRole(profile.role, profile);
  }

  if (authRecord.needs_pin_setup) {
    if (!profile.employeeId) {
      return loginPathForRole(profile.role, profile);
    }
    if (await hasValidOtpSetupSessionForUser(profile.employeeId, email)) {
      return "/login/set-pin";
    }
    return `${loginPathForRole(profile.role, profile)}?error=setup_session`;
  }

  if (!(await hasValidPortalPinSessionForUser(profile.employeeId!, email))) {
    return "/login/verify-pin";
  }

  if (!authRecord.two_factor_enabled) return "/login/setup-2fa";

  if (!(await hasValidPortal2faSessionForUser(profile.employeeId!, email, authSignInAt))) {
    return "/login/verify-2fa";
  }

  const authRecordAfter2fa = await getHeadOfficePortalAuthByEmployeeId(profile.employeeId!);
  if (authRecordAfter2fa && !authRecordAfter2fa.unlock_code_hash) {
    return "/login/set-unlock-code";
  }

  const authRecordFinal = await getHeadOfficePortalAuthByEmployeeId(profile.employeeId!);
  if (
    authRecordFinal &&
    resolveHeadOfficePasswordExpiryContext(authRecordFinal).isPasswordExpired
  ) {
    return HEAD_OFFICE_PASSWORD_CHANGE_PATH;
  }

  return authenticatedLandingPath(profile.role, profile);
}

export function generateHeadOfficeOtp(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

export type OtpProvisionAudit = {
  provisionedByEmployeeId?: string | null;
  provisionedByName?: string | null;
  provisionedByRank?: string | null;
  provisionedLat?: number | null;
  provisionedLng?: number | null;
  provisionedLocationLabel?: string | null;
  subjectName?: string | null;
  subjectRank?: string | null;
  companyId?: string | null;
};

export async function upsertExecutivePortalRecoveryEmail(
  employeeId: string,
  workEmail: string,
  recoveryEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  const email = normalizeWorkEmail(workEmail);
  const validated = validateExecutiveRecoveryEmail(email, recoveryEmail);
  if (!validated.ok) return { ok: false, error: validated.error };

  const service = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const existing = await getHeadOfficePortalAuthByEmployeeId(employeeId);

  if (existing) {
    const { error } = await service
      .from("head_office_portal_auth")
      .update({
        work_email: email,
        recovery_email: validated.recoveryEmail,
        updated_at: now,
      })
      .eq("employee_id", employeeId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await service.from("head_office_portal_auth").insert({
    employee_id: employeeId,
    work_email: email,
    recovery_email: validated.recoveryEmail,
    is_active: false,
    needs_pin_setup: true,
    updated_at: now,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function provisionHeadOfficePortalOtp(
  employeeId: string,
  workEmail: string,
  metadata?: {
    fullName?: string | null;
    recoveryEmail?: string | null;
    audit?: OtpProvisionAudit;
  },
): Promise<{
  ok: boolean;
  loginUsername?: string;
  emailed?: boolean;
  emailError?: string;
  /** HR-desk delivery only — never returned when OTP is emailed. */
  displayOtp?: string;
  error?: string;
}> {
  const email = normalizeWorkEmail(workEmail);
  if (!email) return { ok: false, error: "Work email is required." };

  const nicResult = await resolveEmployeePortalNic(employeeId);
  if (!nicResult.ok || !nicResult.nic) {
    return { ok: false, error: nicResult.error ?? "EPF number is required." };
  }

  const loginUsername = nicResult.nic;
  const portalAuthEmail = portalAuthEmailFromUsername(loginUsername);

  const otp = generateHeadOfficeOtp();
  const service = createSupabaseServiceClient();
  const now = new Date();
  const subjectRank = metadata?.audit?.subjectRank ?? null;
  const existingAuth = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  let recoveryEmail: string | null = existingAuth?.recovery_email ?? null;

  if (requiresExecutiveRecoveryEmail(subjectRank)) {
    const candidate =
      metadata?.recoveryEmail?.trim() || existingAuth?.recovery_email?.trim() || "";
    const validated = validateExecutiveRecoveryEmail(email, candidate);
    if (!validated.ok) return { ok: false, error: validated.error };
    recoveryEmail = validated.recoveryEmail;
  }

  const otpLifetimeMs = otpLifetimeMsForRank(subjectRank);
  const otpExpiresAt = new Date(now.getTime() + otpLifetimeMs).toISOString();

  const authSync = await syncHeadOfficeSupabaseAuthPassword(portalAuthEmail, otp, {
    employeeId,
    fullName: metadata?.fullName ?? null,
  });
  if (!authSync.ok) {
    return { ok: false, error: authSync.error ?? "Failed to sync portal login." };
  }

  const audit = metadata?.audit;
  const { error } = await service.from("head_office_portal_auth").upsert(
    {
      employee_id: employeeId,
      work_email: email,
      login_username: loginUsername,
      portal_auth_email: portalAuthEmail,
      current_otp: otp,
      otp_expires_at: otpExpiresAt,
      pin_hash: null,
      unlock_code_hash: null,
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      needs_pin_setup: true,
      must_change_password: false,
      is_active: true,
      failed_password_attempts: 0,
      failed_2fa_attempts: 0,
      is_username_locked: false,
      locked_until: null,
      last_otp_provisioned_at: now.toISOString(),
      last_otp_provisioned_by_employee_id: audit?.provisionedByEmployeeId ?? null,
      last_otp_provisioned_by_name: audit?.provisionedByName ?? null,
      last_otp_provisioned_lat: audit?.provisionedLat ?? null,
      last_otp_provisioned_lng: audit?.provisionedLng ?? null,
      last_otp_provisioned_location_label: audit?.provisionedLocationLabel ?? null,
      recovery_email: recoveryEmail,
      updated_at: now.toISOString(),
    },
    { onConflict: "employee_id" },
  );

  if (error) return { ok: false, error: error.message };

  await clearPortalPasswordHistory(service, employeeId, "head_office");

  let emailed = false;
  let emailError: string | undefined;
  const shouldEmailOtp = receivesWorkEmailOtpOnProvision(subjectRank);

  if (shouldEmailOtp) {
    const portalForEmail = isExecutivePortalRank(subjectRank)
      ? "md"
      : staffPortalIdForRole(subjectRank) ?? "hq";
    const mail = await sendHeadOfficePortalOtpEmail({
      to: email,
      otp,
      staffName: audit?.subjectName ?? metadata?.fullName ?? "Staff",
      portalLabel: isExecutivePortalRank(subjectRank)
        ? "MD Portal"
        : headOfficePortalOtpLabel(portalForEmail),
      expiresMinutes: otpExpiresMinutesForRank(subjectRank),
      portal: portalForEmail,
    });

    if (mail.emailed) {
      emailed = true;
    } else if (!mail.ok && mail.error) {
      emailError = mail.error;
    }
  }

  if (audit?.provisionedByName) {
    await notifyExecutivesOfOtpProvision({
      companyId: audit.companyId ?? null,
      subjectEmployeeId: employeeId,
      subjectName: audit.subjectName ?? metadata?.fullName ?? "Staff",
      subjectRank: audit.subjectRank ?? null,
      provisionedByName: audit.provisionedByName,
      provisionedByRank: audit.provisionedByRank ?? null,
      emailed,
    });
  }

  await recordHeadOfficeOtpProvisionEvents({
    employeeId,
    portalAuthEmail,
    subjectRank,
    provisionedByName: audit?.provisionedByName ?? null,
    provisionedByRank: audit?.provisionedByRank ?? null,
    emailed,
    emailError,
  });

  return {
    ok: true,
    loginUsername,
    emailed,
    emailError,
    displayOtp: !shouldEmailOtp ? otp : undefined,
  };
}

export async function resetHeadOfficePortalAccess(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (authRecord) {
    const revokedPassword = randomHex(24);
    const authEmail = resolvePortalAuthEmail(authRecord);
    await syncHeadOfficeSupabaseAuthPassword(authEmail, revokedPassword, {
      employeeId,
    });
  }

  const service = createSupabaseServiceClient();
  await clearPortalPasswordHistory(service, employeeId, "head_office");
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      is_active: false,
      pin_hash: null,
      unlock_code_hash: null,
      current_otp: null,
      otp_expires_at: null,
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      needs_pin_setup: true,
      failed_password_attempts: 0,
      failed_2fa_attempts: 0,
      is_username_locked: false,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** When an incumbent rejects a concurrent login, the challenger must re-provision via HR OTP. */
export async function invalidatePortalPasswordAfterRejectedLogin(
  employeeId: string,
): Promise<void> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord) return;

  const authEmail = resolvePortalAuthEmail(authRecord);
  const revokedPassword = randomHex(24);
  await syncHeadOfficeSupabaseAuthPassword(authEmail, revokedPassword, {
    employeeId,
  });

  const service = createSupabaseServiceClient();
  await clearPortalPasswordHistory(service, employeeId, "head_office");
  await service
    .from("head_office_portal_auth")
    .update({
      pin_hash: null,
      needs_pin_setup: true,
      must_change_password: false,
      current_otp: null,
      otp_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);
}

/** Force password rotation on next portal sign-in (HR/MD desk reset without OTP). */
export async function markHeadOfficePortalPasswordRotationRequired(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }
  if (authRecord.needs_pin_setup) {
    return { ok: false, error: "Complete OTP setup before forcing rotation." };
  }

  const service = createSupabaseServiceClient();
  const cleared = await clearPortalPasswordHistory(service, employeeId, "head_office");
  if (!cleared.ok) {
    return { ok: false, error: cleared.error ?? "Could not clear password history." };
  }

  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function verifyHeadOfficePortalCode(
  email: string,
  code: string,
): Promise<{
  ok: boolean;
  needsPinSetup?: boolean;
  error?: string;
}> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter your OTP or password." };
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(email);
  if (!authRecord || !authRecord.is_active) {
    return {
      ok: false,
      error: "Portal access is not active. Contact OD or MD.",
    };
  }

  const subjectRank = await resolveEmployeePortalRank(authRecord.employee_id);
  const passwordPolicy = await resolvePortalPasswordPolicyContext(
    authRecord.employee_id,
  );

  if (authRecord.needs_pin_setup) {
    if (!isHeadOfficeOtpCode(trimmed)) {
      return { ok: false, error: `Enter the ${HO_PORTAL_OTP_LENGTH}-digit OTP.` };
    }
    if (!authRecord.current_otp || trimmed !== authRecord.current_otp) {
      return { ok: false, error: "Invalid OTP." };
    }
    if (!isHeadOfficeOtpValid(authRecord)) {
      const minutes = otpExpiresMinutesForRank(subjectRank);
      return {
        ok: false,
        error: `OTP expired (${minutes}-minute limit). Ask OD or MD for a new one.`,
      };
    }
    return { ok: true, needsPinSetup: true };
  }

  const passwordCheck = validateHeadOfficePortalPasswordForRank(
    trimmed,
    passwordPolicy.rank,
    { rbacGated: passwordPolicy.rbacGated },
  );
  if (!passwordCheck.ok) {
    return { ok: false, error: passwordCheck.error };
  }

  const { verifyPortalPin } = await import("./head-office-portal-pin");
  if (!authRecord.pin_hash || !verifyPortalPin(trimmed, authRecord.pin_hash)) {
    return { ok: false, error: "Invalid password." };
  }

  const service = createSupabaseServiceClient();
  await service
    .from("head_office_portal_auth")
    .update({ last_login_at: new Date().toISOString() })
    .eq("employee_id", authRecord.employee_id);

  return { ok: true, needsPinSetup: false };
}

export async function setHeadOfficePortalPin(
  employeeId: string,
  email: string,
  newPin: string,
): Promise<{ ok: boolean; error?: string }> {
  const passwordPolicy = await resolvePortalPasswordPolicyContext(employeeId);
  const passwordCheck = validateHeadOfficePortalPasswordForRank(
    newPin,
    passwordPolicy.rank,
    { rbacGated: passwordPolicy.rbacGated },
  );
  if (!passwordCheck.ok) {
    return { ok: false, error: passwordCheck.error };
  }

  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }
  if (!portalSessionEmailMatches(authRecord, email)) {
    return {
      ok: false,
      error: "Your sign-in session does not match this account. Sign out and sign in again.",
    };
  }
  if (!authRecord.needs_pin_setup) {
    return { ok: false, error: "PIN is already set." };
  }
  if (
    requiresExecutiveRecoveryEmail(passwordPolicy.rank) &&
    !hasExecutiveRecoveryEmailOnRecord(authRecord)
  ) {
    return {
      ok: false,
      error: "Recovery email must be on file before MD/OD can finish setup.",
    };
  }

  const authSync = await syncHeadOfficeSupabaseAuthPassword(
    resolvePortalAuthEmail(authRecord),
    newPin,
    { employeeId },
  );
  if (!authSync.ok) {
    return { ok: false, error: authSync.error ?? "Failed to save portal login." };
  }

  const { hashPortalPin } = await import("./head-office-portal-pin");
  const changedAt = new Date();
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      pin_hash: hashPortalPin(newPin),
      current_otp: null,
      otp_expires_at: null,
      needs_pin_setup: false,
      password_changed_at: changedAt.toISOString(),
      password_expires_at: computePasswordExpiresAt(changedAt).toISOString(),
      must_change_password: false,
      updated_at: changedAt.toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function changeHeadOfficePortalPassword(
  employeeId: string,
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmedCurrent = currentPassword.trim();
  const trimmedNew = newPassword.trim();
  if (!trimmedCurrent) {
    return { ok: false, error: "Enter your current password." };
  }
  if (!trimmedNew) {
    return { ok: false, error: "Enter a new password." };
  }

  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }
  if (authRecord.needs_pin_setup) {
    return { ok: false, error: "Finish initial password setup before changing it." };
  }
  if (!portalSessionEmailMatches(authRecord, email)) {
    return {
      ok: false,
      error: "Your sign-in session does not match this account. Sign out and sign in again.",
    };
  }

  const { verifyPortalPin } = await import("./head-office-portal-pin");
  if (!authRecord.pin_hash || !verifyPortalPin(trimmedCurrent, authRecord.pin_hash)) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const passwordPolicy = await resolvePortalPasswordPolicyContext(employeeId);
  const passwordCheck = validateHeadOfficePortalPasswordForRank(
    trimmedNew,
    passwordPolicy.rank,
    { rbacGated: passwordPolicy.rbacGated },
  );
  if (!passwordCheck.ok) {
    return { ok: false, error: passwordCheck.error };
  }

  const service = createSupabaseServiceClient();
  let historyHashes: string[] = [];
  try {
    historyHashes = await fetchPortalPasswordHistoryHashes(
      service,
      employeeId,
      "head_office",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load password history.";
    return { ok: false, error: message };
  }

  const reuseCheck = validateHeadOfficePortalPasswordRotation(trimmedNew, {
    currentHash: authRecord.pin_hash,
    historyHashes,
  });
  if (!reuseCheck.ok) {
    return { ok: false, error: reuseCheck.error };
  }

  if (authRecord.pin_hash) {
    const historyResult = await recordPasswordHistory(service, {
      employeeId,
      portalKind: "head_office",
      previousCredentialHash: authRecord.pin_hash,
    });
    if (!historyResult.ok) {
      return { ok: false, error: historyResult.error ?? "Could not save password history." };
    }
  }

  const authSync = await syncHeadOfficeSupabaseAuthPassword(
    resolvePortalAuthEmail(authRecord),
    trimmedNew,
    { employeeId },
  );
  if (!authSync.ok) {
    return { ok: false, error: authSync.error ?? "Failed to save portal login." };
  }

  const { hashPortalPin } = await import("./head-office-portal-pin");
  const changedAt = new Date();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      pin_hash: hashPortalPin(trimmedNew),
      password_changed_at: changedAt.toISOString(),
      password_expires_at: computePasswordExpiresAt(changedAt).toISOString(),
      must_change_password: false,
      updated_at: changedAt.toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function parseStoredBackupCodeHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

async function loadHeadOfficeTotpBackupCodeHashes(
  employeeId: string,
): Promise<string[]> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select("totp_backup_code_hashes")
    .eq("employee_id", employeeId)
    .maybeSingle();

  return parseStoredBackupCodeHashes(data?.totp_backup_code_hashes);
}

async function loadHeadOfficeTotpSecretForEmployee(
  employeeId: string,
): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select("totp_secret")
    .eq("employee_id", employeeId)
    .maybeSingle();

  const stored =
    typeof data?.totp_secret === "string" ? data.totp_secret.trim() : "";
  if (!stored) return null;

  const secret = resolveHeadOfficeTotpSecret(stored);
  if (!secret) return null;

  if (!isEncryptedHeadOfficeTotpSecret(stored)) {
    await service
      .from("head_office_portal_auth")
      .update({
        totp_secret: encryptHeadOfficeTotpSecret(secret),
        updated_at: new Date().toISOString(),
      })
      .eq("employee_id", employeeId);
  }

  return secret;
}

async function consumeHeadOfficeBackupCode(
  employeeId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const hashes = await loadHeadOfficeTotpBackupCodeHashes(employeeId);
  if (hashes.length === 0) {
    return { ok: false, error: HEAD_OFFICE_NO_BACKUP_CODES_ERROR };
  }

  const match = verifyHeadOfficeBackupCode(code, hashes);
  if (!match.valid) {
    return { ok: false, error: "Invalid backup code." };
  }

  const remaining = hashes.filter((_, index) => index !== match.index);
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      totp_backup_code_hashes: remaining,
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function verifyHeadOfficeTotpOrBackupCode(
  employeeId: string,
  secret: string,
  code: string,
): Promise<{ ok: boolean; usedBackupCode?: boolean; error?: string }> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter your authenticator or backup code." };
  }

  if (isHeadOfficeBackupCodeInput(trimmed)) {
    const backup = await consumeHeadOfficeBackupCode(employeeId, trimmed);
    if (!backup.ok) return { ok: false, error: backup.error };
    await startHeadOfficeOd2faRecoveryLockout(employeeId);
    return { ok: true, usedBackupCode: true };
  }

  if (!/^\d{6}$/.test(trimmed)) {
    return {
      ok: false,
      error: "Enter a 6-digit authenticator code or 8-character backup code.",
    };
  }

  if (!secret || !verifyHeadOfficeTotpCode(secret, trimmed)) {
    return { ok: false, error: "Invalid authenticator code." };
  }

  return { ok: true, usedBackupCode: false };
}

export async function beginHeadOfficeTotpSetup(
  employeeId: string,
  email: string,
): Promise<{ ok: boolean; secret?: string; uri?: string; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }
  if (!portalSessionEmailMatches(authRecord, email)) {
    return {
      ok: false,
      error: "Your sign-in session does not match this account. Sign out and sign in again.",
    };
  }

  const secret = generateHeadOfficeTotpSecret();
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      totp_secret: encryptHeadOfficeTotpSecret(secret),
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    secret,
    uri: buildHeadOfficeTotpUri(secret, normalizeWorkEmail(email)),
  };
}

export async function confirmHeadOfficeTotpSetup(
  employeeId: string,
  email: string,
  code: string,
): Promise<{ ok: boolean; backupCodes?: string[]; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }

  const secret = await loadHeadOfficeTotpSecretForEmployee(employeeId);
  if (!secret) {
    return { ok: false, error: "2FA setup expired. Start again." };
  }

  if (!verifyHeadOfficeTotpCode(secret, code)) {
    return { ok: false, error: "Invalid authenticator code." };
  }

  const backupCodes = generateHeadOfficeBackupCodes();
  const backupHashes = backupCodes.map((backupCode) =>
    hashHeadOfficeBackupCode(backupCode),
  );

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      two_factor_enabled: true,
      totp_backup_code_hashes: backupHashes,
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  await setPortal2faSessionCookies(
    employeeId,
    email,
    await getAuthenticatedSignInAt(),
  );
  return { ok: true, backupCodes };
}

export async function verifyHeadOfficeMfaCode(
  employeeId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active || !authRecord.two_factor_enabled) {
    return { ok: false, error: "Two-factor authentication is not enabled." };
  }

  const secret = await loadHeadOfficeTotpSecretForEmployee(employeeId);
  const verified = await verifyHeadOfficeTotpOrBackupCode(
    employeeId,
    secret ?? "",
    code,
  );
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  return { ok: true };
}

/** Authenticator-only step-up for sensitive account changes (no backup codes). */
export async function verifyHeadOfficeTotpStepUp(
  employeeId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active || !authRecord.two_factor_enabled) {
    return {
      ok: false,
      error: "Enable two-factor authentication before changing account security settings.",
    };
  }

  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: "Enter your current 6-digit authenticator code." };
  }

  const secret = await loadHeadOfficeTotpSecretForEmployee(employeeId);
  if (!secret || !verifyHeadOfficeTotpCode(secret, trimmed)) {
    return { ok: false, error: "Invalid authenticator code." };
  }

  return { ok: true };
}

export async function verifyHeadOfficeTotpLogin(
  employeeId: string,
  email: string,
  code: string,
  rank?: string | null,
): Promise<{ ok: boolean; requires2faSetup?: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active || !authRecord.two_factor_enabled) {
    return { ok: false, error: "Two-factor authentication is not enabled." };
  }

  const lockCheck = await assertPortalLoginNotLocked(employeeId, rank ?? null);
  if (!lockCheck.ok) {
    return { ok: false, error: lockCheck.error };
  }

  const secret = await loadHeadOfficeTotpSecretForEmployee(employeeId);
  const verified = await verifyHeadOfficeTotpOrBackupCode(
    employeeId,
    secret ?? "",
    code,
  );
  if (!verified.ok) {
    if (rank) {
      const failure = await recordPortal2faFailure(employeeId, rank);
      return { ok: false, error: failure.error };
    }
    return { ok: false, error: verified.error };
  }

  await clearPortalLoginFailures(employeeId);

  if (verified.usedBackupCode) {
    const service = createSupabaseServiceClient();
    const { error } = await service
      .from("head_office_portal_auth")
      .update({
        totp_secret: null,
        two_factor_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("employee_id", employeeId);

    if (error) {
      return { ok: false, error: error.message };
    }

    await clearPortal2faSessionCookiesStore();
    await recordPortalLoginEvent({
      employeeId,
      portalAuthEmail: email,
      eventType: "totp_success",
      success: true,
      detail: JSON.stringify({ method: "backup_code", requiresReregistration: true }),
    });
    return { ok: true, requires2faSetup: true };
  }

  await setPortal2faSessionCookies(
    employeeId,
    email,
    await getAuthenticatedSignInAt(),
  );
  await recordPortalLoginEvent({
    employeeId,
    portalAuthEmail: email,
    eventType: "totp_success",
    success: true,
    detail: JSON.stringify({ method: "authenticator" }),
  });
  return { ok: true };
}

export async function disableHeadOfficeTotp(
  employeeId: string,
  email: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }
  if (!portalSessionEmailMatches(authRecord, email)) {
    return {
      ok: false,
      error: "Your sign-in session does not match this account. Sign out and sign in again.",
    };
  }
  if (!authRecord.two_factor_enabled) {
    return { ok: true };
  }

  const secret = await loadHeadOfficeTotpSecretForEmployee(employeeId);
  const verified = await verifyHeadOfficeTotpOrBackupCode(
    employeeId,
    secret ?? "",
    code,
  );
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  await clearPortal2faSessionCookiesStore();
  return { ok: true };
}

export { PORTAL_IDLE_LOCK_MINUTES } from './portal-idle-lock';

export async function setHeadOfficeUnlockCode(
  employeeId: string,
  _email: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const validation = validatePortalUnlockCode(code);
  if (!validation.ok) return { ok: false, error: validation.error };

  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }
  if (!authRecord.two_factor_enabled) {
    return { ok: false, error: "Complete 2FA setup first." };
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      unlock_code_hash: hashPortalUnlockCode(code),
      unlock_code_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function verifyHeadOfficeUnlockCode(
  employeeId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord?.unlock_code_hash) {
    return { ok: false, error: "Unlock code is not set." };
  }
  if (!verifyPortalUnlockCode(code, authRecord.unlock_code_hash)) {
    return { ok: false, error: "Invalid unlock code." };
  }
  return { ok: true };
}

export async function resetHeadOfficeUnlockCodeWithPassword(
  employeeId: string,
  password: string,
  newCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const validation = validatePortalUnlockCode(newCode);
  if (!validation.ok) return { ok: false, error: validation.error };

  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }

  const passwordPolicy = await resolvePortalPasswordPolicyContext(employeeId);
  const passwordCheck = validateHeadOfficePortalPasswordForRank(
    password,
    passwordPolicy.rank,
    { rbacGated: passwordPolicy.rbacGated },
  );
  if (!passwordCheck.ok) {
    return { ok: false, error: passwordCheck.error };
  }

  const { verifyPortalPin } = await import("./head-office-portal-pin");
  if (!authRecord.pin_hash || !verifyPortalPin(password, authRecord.pin_hash)) {
    return { ok: false, error: "Invalid login password." };
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      unlock_code_hash: hashPortalUnlockCode(newCode),
      unlock_code_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function adminResetHeadOfficeTotp(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord) {
    return { ok: false, error: "Portal access is not provisioned." };
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
