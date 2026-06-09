import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

import { createSupabaseServiceClient } from "../../../packages/supabase/service";
import type { BackOfficeUserProfile } from "./hr-portal-access";
import { isImmutableExecutiveRank } from "../../../packages/portal-rbac";

export const HO_PORTAL_PIN_LENGTH = 6;
export const HO_PORTAL_PIN_COOKIE = "pz_ho_pin_session";
export const HO_PORTAL_OTP_OK_COOKIE = "pz_ho_otp_ok";

const PIN_ITERATIONS = 100_000;
const PIN_SESSION_MS = 12 * 60 * 60 * 1000;
const OTP_OK_MS = 10 * 60 * 1000;

export type HeadOfficePortalAuthRecord = {
  employee_id: string;
  work_email: string;
  pin_hash: string | null;
  current_otp: string | null;
  needs_pin_setup: boolean;
  is_active: boolean;
};

export type PortalAccessGate =
  | "ok"
  | "revoked"
  | "not_provisioned"
  | "verify_pin"
  | "set_pin";

export function normalizeWorkEmail(email: string): string {
  return email.trim().toLowerCase();
}

function pinCookieSecret(): string {
  return (
    process.env.PORTAL_PIN_COOKIE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dev-portal-pin-secret"
  );
}

export function hashPortalPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, "sha256").toString(
    "hex",
  );
  return `${salt}:${hash}`;
}

export function verifyPortalPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, "sha256").toString(
    "hex",
  );
  try {
    return timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(derived, "hex"),
    );
  } catch {
    return false;
  }
}

function signPayload(payload: string): string {
  return createHmac("sha256", pinCookieSecret()).update(payload).digest("hex");
}

function encodeSignedToken(payload: string): string {
  return `${Buffer.from(payload).toString("base64url")}.${signPayload(payload)}`;
}

function decodeSignedToken(
  token: string,
): { payload: string; valid: boolean } {
  const [body, sig] = token.split(".");
  if (!body || !sig) return { payload: "", valid: false };
  const payload = Buffer.from(body, "base64url").toString("utf8");
  const expected = signPayload(payload);
  try {
    const valid = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return { payload, valid };
  } catch {
    return { payload: "", valid: false };
  }
}

export function requiresHeadOfficePortalPin(
  profile: BackOfficeUserProfile,
  userEmail: string | null | undefined,
): boolean {
  if (!profile.employeeId || !userEmail) return false;
  if (isImmutableExecutiveRank(profile.role)) return false;
  const email = normalizeWorkEmail(userEmail);
  if (!email || email.endsWith("@pearzen.local")) return false;
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
    .select(
      "employee_id, work_email, pin_hash, current_otp, needs_pin_setup, is_active",
    )
    .ilike("work_email", normalized)
    .maybeSingle();

  if (!data) return null;
  return {
    employee_id: String(data.employee_id),
    work_email: String(data.work_email),
    pin_hash: typeof data.pin_hash === "string" ? data.pin_hash : null,
    current_otp: typeof data.current_otp === "string" ? data.current_otp : null,
    needs_pin_setup: Boolean(data.needs_pin_setup),
    is_active: Boolean(data.is_active),
  };
}

export async function getHeadOfficePortalAuthByEmployeeId(
  employeeId: string,
): Promise<HeadOfficePortalAuthRecord | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("head_office_portal_auth")
    .select(
      "employee_id, work_email, pin_hash, current_otp, needs_pin_setup, is_active",
    )
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (!data) return null;
  return {
    employee_id: String(data.employee_id),
    work_email: String(data.work_email),
    pin_hash: typeof data.pin_hash === "string" ? data.pin_hash : null,
    current_otp: typeof data.current_otp === "string" ? data.current_otp : null,
    needs_pin_setup: Boolean(data.needs_pin_setup),
    is_active: Boolean(data.is_active),
  };
}

export function hasValidPortalPinSession(
  req: NextRequest,
  employeeId: string,
  email: string,
): boolean {
  const token = req.cookies.get(HO_PORTAL_PIN_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = decodeSignedToken(token);
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

export function hasValidOtpSetupSession(
  req: NextRequest,
  employeeId: string,
  email: string,
): boolean {
  const token = req.cookies.get(HO_PORTAL_OTP_OK_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = decodeSignedToken(token);
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

  const { payload, valid } = decodeSignedToken(token);
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

  const { payload, valid } = decodeSignedToken(token);
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

export function attachPortalPinSessionCookie(
  response: NextResponse,
  employeeId: string,
  email: string,
): void {
  const exp = Date.now() + PIN_SESSION_MS;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  response.cookies.set(HO_PORTAL_PIN_COOKIE, encodeSignedToken(payload), {
    ...cookieBase,
    maxAge: Math.floor(PIN_SESSION_MS / 1000),
  });
  response.cookies.delete(HO_PORTAL_OTP_OK_COOKIE);
}

export function attachOtpSetupSessionCookie(
  response: NextResponse,
  employeeId: string,
  email: string,
): void {
  const exp = Date.now() + OTP_OK_MS;
  const payload = `${employeeId}:${normalizeWorkEmail(email)}:${exp}`;
  response.cookies.set(HO_PORTAL_OTP_OK_COOKIE, encodeSignedToken(payload), {
    ...cookieBase,
    maxAge: Math.floor(OTP_OK_MS / 1000),
  });
}

export function clearPortalPinSessionCookies(response: NextResponse): void {
  response.cookies.delete(HO_PORTAL_PIN_COOKIE);
  response.cookies.delete(HO_PORTAL_OTP_OK_COOKIE);
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
  cookieStore.set(HO_PORTAL_PIN_COOKIE, encodeSignedToken(payload), {
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
  cookieStore.set(HO_PORTAL_OTP_OK_COOKIE, encodeSignedToken(payload), {
    ...cookieBase,
    maxAge: Math.floor(OTP_OK_MS / 1000),
  });
}

export async function clearPortalPinSessionCookiesStore(): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete(HO_PORTAL_PIN_COOKIE);
  cookieStore.delete(HO_PORTAL_OTP_OK_COOKIE);
}

export function isPortalPinExemptPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/")
  );
}

export async function resolvePortalAccessGate(
  req: NextRequest,
  profile: BackOfficeUserProfile,
  userEmail: string | null | undefined,
): Promise<PortalAccessGate> {
  if (!requiresHeadOfficePortalPin(profile, userEmail)) return "ok";

  const authRecord = await getHeadOfficePortalAuthByEmail(userEmail!);
  if (!authRecord || !authRecord.is_active) {
    return !authRecord ? "not_provisioned" : "revoked";
  }

  const { pathname } = req.nextUrl;

  if (authRecord.needs_pin_setup) {
    if (pathname === "/login/set-pin") {
      const otpOk = hasValidOtpSetupSession(req, profile.employeeId!, userEmail!);
      return otpOk ? "ok" : "verify_pin";
    }
    return "verify_pin";
  }

  if (
    hasValidPortalPinSession(req, profile.employeeId!, userEmail!)
  ) {
    return "ok";
  }

  if (pathname === "/login/set-pin") return "verify_pin";
  return "verify_pin";
}

export function generateHeadOfficeOtp(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

export async function provisionHeadOfficePortalOtp(
  employeeId: string,
  workEmail: string,
): Promise<{ ok: boolean; otp?: string; error?: string }> {
  const email = normalizeWorkEmail(workEmail);
  if (!email) return { ok: false, error: "Work email is required." };

  const otp = generateHeadOfficeOtp();
  const service = createSupabaseServiceClient();
  const now = new Date().toISOString();

  const { error } = await service.from("head_office_portal_auth").upsert(
    {
      employee_id: employeeId,
      work_email: email,
      current_otp: otp,
      pin_hash: null,
      needs_pin_setup: true,
      is_active: true,
      updated_at: now,
    },
    { onConflict: "employee_id" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, otp };
}

export async function resetHeadOfficePortalAccess(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      is_active: false,
      pin_hash: null,
      current_otp: null,
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
  if (!new RegExp(`^\\d{${HO_PORTAL_PIN_LENGTH}}$`).test(trimmed)) {
    return { ok: false, error: `Enter a ${HO_PORTAL_PIN_LENGTH}-digit code.` };
  }

  const authRecord = await getHeadOfficePortalAuthByEmail(email);
  if (!authRecord || !authRecord.is_active) {
    return {
      ok: false,
      error: "Portal access is not active. Contact your Managing Director.",
    };
  }

  if (authRecord.needs_pin_setup) {
    if (!authRecord.current_otp || trimmed !== authRecord.current_otp) {
      return { ok: false, error: "Invalid OTP." };
    }
    return { ok: true, needsPinSetup: true };
  }

  if (!authRecord.pin_hash || !verifyPortalPin(trimmed, authRecord.pin_hash)) {
    return { ok: false, error: "Invalid PIN." };
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
  if (!new RegExp(`^\\d{${HO_PORTAL_PIN_LENGTH}}$`).test(newPin)) {
    return { ok: false, error: `PIN must be exactly ${HO_PORTAL_PIN_LENGTH} digits.` };
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

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("head_office_portal_auth")
    .update({
      pin_hash: hashPortalPin(newPin),
      current_otp: null,
      needs_pin_setup: false,
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
