import type { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "../../../packages/supabase/service";
import {
  decodeSignedPortalCookie,
  encodeSignedPortalCookie,
} from "./head-office-portal-cookie-crypto";
import type { BackOfficeUserProfile } from "./hr-portal-access";
import { authenticatedLandingPath } from "./hr-portal-access";
import {
  HO_PORTAL_OTP_LENGTH,
  isHeadOfficeOtpCode,
  validateHeadOfficePortalPassword,
} from "./head-office-portal-password";
import {
  generateHeadOfficeBackupCodes,
  hashHeadOfficeBackupCode,
  isHeadOfficeBackupCodeInput,
  verifyHeadOfficeBackupCode,
} from "./head-office-totp-backup";
import {
  generateHeadOfficeTotpSecret,
  verifyHeadOfficeTotpCode,
  buildHeadOfficeTotpUri,
} from "./head-office-totp";

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
  pin_hash: string | null;
  current_otp: string | null;
  otp_expires_at: string | null;
  needs_pin_setup: boolean;
  is_active: boolean;
  two_factor_enabled: boolean;
  last_otp_provisioned_at: string | null;
  last_otp_provisioned_by_name: string | null;
  last_otp_provisioned_location_label: string | null;
};

export type HeadOfficePortalAuthStatus = {
  isProvisioned: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastOtpProvisionedAt: string | null;
  lastOtpProvisionedByName: string | null;
  lastOtpProvisionedLocationLabel: string | null;
};

export type PortalAccessGate =
  | "ok"
  | "revoked"
  | "not_provisioned"
  | "verify_pin"
  | "set_pin"
  | "setup_2fa"
  | "verify_2fa";

export function normalizeWorkEmail(email: string): string {
  return email.trim().toLowerCase();
}

const HEAD_OFFICE_PORTAL_AUTH_SELECT =
  "employee_id, work_email, pin_hash, current_otp, otp_expires_at, needs_pin_setup, is_active, two_factor_enabled, last_otp_provisioned_at, last_otp_provisioned_by_name, last_otp_provisioned_location_label";

function mapHeadOfficePortalAuthRow(data: Record<string, unknown>): HeadOfficePortalAuthRecord {
  return {
    employee_id: String(data.employee_id),
    work_email: String(data.work_email),
    pin_hash: typeof data.pin_hash === "string" ? data.pin_hash : null,
    current_otp: typeof data.current_otp === "string" ? data.current_otp : null,
    otp_expires_at:
      typeof data.otp_expires_at === "string" ? data.otp_expires_at : null,
    needs_pin_setup: Boolean(data.needs_pin_setup),
    is_active: Boolean(data.is_active),
    two_factor_enabled: Boolean(data.two_factor_enabled),
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
  };
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

  const existingId = await findSupabaseAuthUserIdByEmail(email);
  if (existingId) {
    const { error } = await service.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
      ...(Object.keys(userMetadata).length > 0
        ? { user_metadata: userMetadata }
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
  if (!email || email.endsWith("@pearzen.local") || email.endsWith("@pearzen.sm")) {
    return false;
  }
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
    .ilike("work_email", normalized)
    .maybeSingle();

  if (!data) return null;
  return mapHeadOfficePortalAuthRow(data as Record<string, unknown>);
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
    normalizeWorkEmail(tokenEmail) !== normalizeWorkEmail(email) ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }
  return true;
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
    normalizeWorkEmail(tokenEmail) !== normalizeWorkEmail(email) ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }
  return true;
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
    normalizeWorkEmail(tokenEmail) !== normalizeWorkEmail(email) ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }
  return true;
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
    normalizeWorkEmail(tokenEmail) !== normalizeWorkEmail(email) ||
    !Number.isFinite(exp) ||
    Date.now() > exp
  ) {
    return false;
  }
  return true;
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
      "employee_id, is_active, two_factor_enabled, last_otp_provisioned_at, last_otp_provisioned_by_name, last_otp_provisioned_location_label",
    )
    .in("employee_id", employeeIds);

  const out: Record<string, HeadOfficePortalAuthStatus> = {};
  for (const id of employeeIds) {
    out[id] = {
      isProvisioned: false,
      isActive: false,
      twoFactorEnabled: false,
      lastOtpProvisionedAt: null,
      lastOtpProvisionedByName: null,
      lastOtpProvisionedLocationLabel: null,
    };
  }

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const employeeId = String(record.employee_id);
    out[employeeId] = {
      isProvisioned: true,
      isActive: Boolean(record.is_active),
      twoFactorEnabled: Boolean(record.two_factor_enabled),
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

  const authRecord = await getHeadOfficePortalAuthByEmail(userEmail!);
  if (!authRecord || !authRecord.is_active) {
    return !authRecord ? "not_provisioned" : "revoked";
  }

  const { pathname } = req.nextUrl;

  if (authRecord.needs_pin_setup) {
    if (pathname === "/login/set-pin") {
      const otpOk = await hasValidOtpSetupSession(
        req,
        profile.employeeId!,
        userEmail!,
      );
      return otpOk ? "ok" : "verify_pin";
    }
    return "verify_pin";
  }

  if (!authRecord.two_factor_enabled) {
    if (
      pathname === "/login/setup-2fa" ||
      isHeadOfficeAccountSecurityPath(pathname)
    ) {
      return (await hasValidPortalPinSession(req, profile.employeeId!, userEmail!))
        ? "ok"
        : "verify_pin";
    }
    return "setup_2fa";
  }

  if (!(await hasValidPortal2faSession(req, profile.employeeId!, userEmail!, authSignInAt))) {
    if (pathname === "/login/verify-2fa") return "ok";
    if (
      isHeadOfficeAccountSecurityPath(pathname) &&
      (await hasValidPortalPinSession(req, profile.employeeId!, userEmail!))
    ) {
      return "ok";
    }
    if (!(await hasValidPortalPinSession(req, profile.employeeId!, userEmail!))) {
      return "verify_pin";
    }
    return "verify_2fa";
  }

  if (await hasValidPortalPinSession(req, profile.employeeId!, userEmail!)) {
    return "ok";
  }

  if (pathname === "/login/set-pin") return "verify_pin";
  return "verify_pin";
}

/** Where an authenticated Head Office user should land (PIN + 2FA gates). */
export async function resolveHeadOfficePortalEntryPath(
  profile: BackOfficeUserProfile,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<string> {
  if (!requiresHeadOfficePortalPin(profile, email)) {
    return authenticatedLandingPath(profile.role, profile);
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(email);
  if (!authRecord || !authRecord.is_active) {
    return "/login/head-office";
  }

  if (authRecord.needs_pin_setup) return "/login/set-pin";

  if (!(await hasValidPortalPinSessionForUser(profile.employeeId!, email))) {
    return "/login/verify-pin";
  }

  if (!authRecord.two_factor_enabled) return "/login/setup-2fa";

  if (!(await hasValidPortal2faSessionForUser(profile.employeeId!, email, authSignInAt))) {
    return "/login/verify-2fa";
  }

  return authenticatedLandingPath(profile.role, profile);
}

export function generateHeadOfficeOtp(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

export type OtpProvisionAudit = {
  provisionedByEmployeeId?: string | null;
  provisionedByName?: string | null;
  provisionedLat?: number | null;
  provisionedLng?: number | null;
  provisionedLocationLabel?: string | null;
};

export async function provisionHeadOfficePortalOtp(
  employeeId: string,
  workEmail: string,
  metadata?: { fullName?: string | null; audit?: OtpProvisionAudit },
): Promise<{ ok: boolean; otp?: string; error?: string }> {
  const email = normalizeWorkEmail(workEmail);
  if (!email) return { ok: false, error: "Work email is required." };

  const otp = generateHeadOfficeOtp();
  const service = createSupabaseServiceClient();
  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + HO_PORTAL_OTP_LIFETIME_MS).toISOString();

  const authSync = await syncHeadOfficeSupabaseAuthPassword(email, otp, {
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
      current_otp: otp,
      otp_expires_at: otpExpiresAt,
      pin_hash: null,
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      needs_pin_setup: true,
      is_active: true,
      last_otp_provisioned_at: now.toISOString(),
      last_otp_provisioned_by_employee_id: audit?.provisionedByEmployeeId ?? null,
      last_otp_provisioned_by_name: audit?.provisionedByName ?? null,
      last_otp_provisioned_lat: audit?.provisionedLat ?? null,
      last_otp_provisioned_lng: audit?.provisionedLng ?? null,
      last_otp_provisioned_location_label: audit?.provisionedLocationLabel ?? null,
      updated_at: now.toISOString(),
    },
    { onConflict: "employee_id" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, otp };
}

export async function resetHeadOfficePortalAccess(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (authRecord?.work_email) {
    const revokedPassword = randomHex(24);
    await syncHeadOfficeSupabaseAuthPassword(
      authRecord.work_email,
      revokedPassword,
      { employeeId },
    );
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      is_active: false,
      pin_hash: null,
      current_otp: null,
      otp_expires_at: null,
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      needs_pin_setup: true,
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

  if (authRecord.needs_pin_setup) {
    if (!isHeadOfficeOtpCode(trimmed)) {
      return { ok: false, error: `Enter the ${HO_PORTAL_OTP_LENGTH}-digit OTP.` };
    }
    if (!authRecord.current_otp || trimmed !== authRecord.current_otp) {
      return { ok: false, error: "Invalid OTP." };
    }
    if (!isHeadOfficeOtpValid(authRecord)) {
      return {
        ok: false,
        error: "OTP expired. Ask OD or MD for a new one.",
      };
    }
    return { ok: true, needsPinSetup: true };
  }

  const passwordCheck = validateHeadOfficePortalPassword(trimmed);
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
  const passwordCheck = validateHeadOfficePortalPassword(newPin);
  if (!passwordCheck.ok) {
    return { ok: false, error: passwordCheck.error };
  }

  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active) {
    return { ok: false, error: "Portal access is not active." };
  }
  if (normalizeWorkEmail(authRecord.work_email) !== normalizeWorkEmail(email)) {
    return { ok: false, error: "Session email mismatch." };
  }
  if (!authRecord.needs_pin_setup) {
    return { ok: false, error: "PIN is already set." };
  }

  const authSync = await syncHeadOfficeSupabaseAuthPassword(email, newPin, {
    employeeId,
  });
  if (!authSync.ok) {
    return { ok: false, error: authSync.error ?? "Failed to save portal login." };
  }

  const { hashPortalPin } = await import("./head-office-portal-pin");
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      pin_hash: hashPortalPin(newPin),
      current_otp: null,
      otp_expires_at: null,
      needs_pin_setup: false,
      updated_at: new Date().toISOString(),
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

async function consumeHeadOfficeBackupCode(
  employeeId: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const hashes = await loadHeadOfficeTotpBackupCodeHashes(employeeId);
  if (hashes.length === 0) {
    return { ok: false, error: "No backup codes remain for this account." };
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
  if (normalizeWorkEmail(authRecord.work_email) !== normalizeWorkEmail(email)) {
    return { ok: false, error: "Session email mismatch." };
  }

  const secret = generateHeadOfficeTotpSecret();
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      totp_secret: secret,
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

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select("totp_secret")
    .eq("employee_id", employeeId)
    .maybeSingle();

  const secret =
    typeof data?.totp_secret === "string" ? data.totp_secret.trim() : "";
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

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select("totp_secret")
    .eq("employee_id", employeeId)
    .maybeSingle();

  const secret =
    typeof data?.totp_secret === "string" ? data.totp_secret.trim() : "";
  const verified = await verifyHeadOfficeTotpOrBackupCode(
    employeeId,
    secret,
    code,
  );
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  return { ok: true };
}

export async function verifyHeadOfficeTotpLogin(
  employeeId: string,
  email: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const authRecord = await getHeadOfficePortalAuthByEmployeeId(employeeId);
  if (!authRecord || !authRecord.is_active || !authRecord.two_factor_enabled) {
    return { ok: false, error: "Two-factor authentication is not enabled." };
  }

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select("totp_secret")
    .eq("employee_id", employeeId)
    .maybeSingle();

  const secret =
    typeof data?.totp_secret === "string" ? data.totp_secret.trim() : "";
  const verified = await verifyHeadOfficeTotpOrBackupCode(
    employeeId,
    secret,
    code,
  );
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  await setPortal2faSessionCookies(
    employeeId,
    email,
    await getAuthenticatedSignInAt(),
  );
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
  if (normalizeWorkEmail(authRecord.work_email) !== normalizeWorkEmail(email)) {
    return { ok: false, error: "Session email mismatch." };
  }
  if (!authRecord.two_factor_enabled) {
    return { ok: true };
  }

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select("totp_secret")
    .eq("employee_id", employeeId)
    .maybeSingle();

  const secret =
    typeof data?.totp_secret === "string" ? data.totp_secret.trim() : "";
  const verified = await verifyHeadOfficeTotpOrBackupCode(
    employeeId,
    secret,
    code,
  );
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

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
