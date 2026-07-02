/**
 * Forge operator portal auth — Google + email/password, PIN, TOTP, unlock code,
 * 30-digit temp passwords, 20-digit backup keys, and 120-hour 2FA recovery lockout.
 */

import type { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import {
  decodeSignedPortalCookie,
  encodeSignedPortalCookie,
} from './head-office-portal-cookie-crypto';
import {
  buildHeadOfficeTotpUri,
  decryptHeadOfficeTotpSecret,
  encryptHeadOfficeTotpSecret,
  generateHeadOfficeTotpSecret,
  verifyHeadOfficeTotpCode,
} from './head-office-totp';
import { hashPortalPin, verifyPortalPin } from './head-office-portal-pin';
import {
  validateHeadOfficePortalPassword,
} from './head-office-portal-password';
import {
  hashPortalUnlockCode,
  validatePortalUnlockCode,
  verifyPortalUnlockCode,
} from './head-office-unlock-code';
import {
  generateForgeBackupCodes,
  hashForgeBackupCode,
  verifyForgeBackupCode,
} from './forge-portal-backup';
import { sendForgeTempPasswordEmail } from './forge-portal-email';
import { isForgeOperatorEmail } from './forge-access';
import {
  forgeLocalDevSkipsSecurityGates,
  isForgeLocalDevRequest,
  isForgeLocalDevRequestFromReq,
} from './forge-local-dev';

export const FORGE_TEMP_PASSWORD_LENGTH = 30;
export const FORGE_BACKUP_CODE_LENGTH = 20;
export const FORGE_BACKUP_CODE_COUNT = 5;
export const OD_2FA_RECOVERY_LOCK_MS = 120 * 60 * 60 * 1000;
export const FORGE_IDLE_LOCK_MINUTES = 15;

export const FORGE_PORTAL_PIN_COOKIE = 'pz_forge_pin_session';
export const FORGE_PORTAL_2FA_COOKIE = 'pz_forge_2fa_session';
export const FORGE_PORTAL_SETUP_COOKIE = 'pz_forge_setup_ok';
export const FORGE_PORTAL_GOOGLE_COOKIE = 'pz_forge_google_session';
export const FORGE_PORTAL_PASSWORD_COOKIE = 'pz_forge_password_session';

const PIN_SESSION_MS = 12 * 60 * 60 * 1000;
const SETUP_OK_MS = 30 * 60 * 1000;
const PORTAL_2FA_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;
const PORTAL_2FA_COOKIE_DELIM = '|';
const FORGE_LOCKOUT_ATTEMPTS = 3;
const FORGE_LOCKOUT_MS = 60 * 60 * 1000;

const FORGE_AUTH_SELECT =
  'operator_email, pin_hash, unlock_code_hash, totp_secret, two_factor_enabled, totp_backup_code_hashes, needs_pin_setup, failed_password_attempts, failed_2fa_attempts, is_locked, locked_until, od_2fa_recovery_locked_until, recovery_email, main_email, temp_password_issued_at';

export type ForgePortalAuthRecord = {
  operator_email: string;
  pin_hash: string | null;
  unlock_code_hash: string | null;
  totp_secret: string | null;
  two_factor_enabled: boolean;
  totp_backup_code_hashes: string[];
  needs_pin_setup: boolean;
  failed_password_attempts: number;
  failed_2fa_attempts: number;
  is_locked: boolean;
  locked_until: string | null;
  od_2fa_recovery_locked_until: string | null;
  recovery_email: string | null;
  main_email: string | null;
  temp_password_issued_at: string | null;
};

export type ForgeAccessGate =
  | 'ok'
  | 'verify_credentials'
  | 'set_pin'
  | 'verify_pin'
  | 'setup_2fa'
  | 'verify_2fa'
  | 'setup_unlock_code'
  | 'locked';

const cookieBase = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapForgeAuthRow(data: Record<string, unknown>): ForgePortalAuthRecord {
  const hashes = data.totp_backup_code_hashes;
  return {
    operator_email: String(data.operator_email),
    pin_hash: typeof data.pin_hash === 'string' ? data.pin_hash : null,
    unlock_code_hash:
      typeof data.unlock_code_hash === 'string' ? data.unlock_code_hash : null,
    totp_secret: typeof data.totp_secret === 'string' ? data.totp_secret : null,
    two_factor_enabled: Boolean(data.two_factor_enabled),
    totp_backup_code_hashes: Array.isArray(hashes)
      ? hashes.filter((entry): entry is string => typeof entry === 'string')
      : [],
    needs_pin_setup: Boolean(data.needs_pin_setup),
    failed_password_attempts: Number(data.failed_password_attempts ?? 0),
    failed_2fa_attempts: Number(data.failed_2fa_attempts ?? 0),
    is_locked: Boolean(data.is_locked),
    locked_until: typeof data.locked_until === 'string' ? data.locked_until : null,
    od_2fa_recovery_locked_until:
      typeof data.od_2fa_recovery_locked_until === 'string'
        ? data.od_2fa_recovery_locked_until
        : null,
    recovery_email:
      typeof data.recovery_email === 'string' ? data.recovery_email : null,
    main_email: typeof data.main_email === 'string' ? data.main_email : null,
    temp_password_issued_at:
      typeof data.temp_password_issued_at === 'string'
        ? data.temp_password_issued_at
        : null,
  };
}

export function generateForgeTempPassword(): string {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < FORGE_TEMP_PASSWORD_LENGTH; i += 1) {
    out += digits[randomInt(0, digits.length)];
  }
  return out;
}

export function generateForgeBackupCode(): string {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < FORGE_BACKUP_CODE_LENGTH; i += 1) {
    out += digits[randomInt(0, digits.length)];
  }
  return out;
}

export function isForgeGatePath(pathname: string): boolean {
  return (
    pathname === '/login/forge' ||
    pathname.startsWith('/login/forge/') ||
    pathname === '/auth/callback'
  );
}

export function isForgePinExemptPath(pathname: string): boolean {
  return (
    isForgeGatePath(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/')
  );
}

async function findSupabaseAuthUserIdByEmail(email: string): Promise<string | null> {
  const service = createSupabaseServiceClient();
  let page = 1;
  const normalized = normalizeEmail(email);

  while (page <= 20) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalized,
    );
    if (match?.id) return match.id;

    if (data.users.length < 200) return null;
    page += 1;
  }

  return null;
}

export async function syncForgeSupabaseAuthPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: 'Email is required.' };

  const service = createSupabaseServiceClient();
  const existingId = await findSupabaseAuthUserIdByEmail(normalized);

  if (existingId) {
    const { error } = await service.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await service.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getForgePortalAuthRecord(
  email: string,
): Promise<ForgePortalAuthRecord | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('forge_portal_auth')
    .select(FORGE_AUTH_SELECT)
    .eq('operator_email', normalized)
    .maybeSingle();

  if (!data) return null;
  return mapForgeAuthRow(data as Record<string, unknown>);
}

export async function ensureForgePortalAuthRecord(
  email: string,
): Promise<ForgePortalAuthRecord> {
  const normalized = normalizeEmail(email);
  const existing = await getForgePortalAuthRecord(normalized);
  if (existing) return existing;

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('forge_portal_auth')
    .insert({
      operator_email: normalized,
      main_email: normalized,
      needs_pin_setup: true,
      updated_at: new Date().toISOString(),
    })
    .select(FORGE_AUTH_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Could not provision Forge auth record.');
  }

  return mapForgeAuthRow(data as Record<string, unknown>);
}

function isForgeAccountLocked(record: ForgePortalAuthRecord): boolean {
  if (!record.is_locked) return false;
  if (!record.locked_until) return true;
  return new Date(record.locked_until).getTime() > Date.now();
}

export async function assertForgeOperatorCanSignIn(
  email: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isForgeOperatorEmail(email))) {
    return { ok: false, error: 'Forge access denied.' };
  }

  const record = email ? await getForgePortalAuthRecord(email) : null;
  if (record && isForgeAccountLocked(record)) {
    return { ok: false, error: 'Forge account is temporarily locked. Try again later.' };
  }

  return { ok: true };
}

export async function startOd2faRecoveryLockout(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const service = createSupabaseServiceClient();
  const lockedUntil = new Date(Date.now() + OD_2FA_RECOVERY_LOCK_MS).toISOString();

  await service.from('forge_portal_auth').upsert(
    {
      operator_email: normalized,
      od_2fa_recovery_locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'operator_email' },
  );
}

function buildForge2faSessionPayload(
  email: string,
  authSignInAt: string,
): string {
  return `${normalizeEmail(email)}${PORTAL_2FA_COOKIE_DELIM}${authSignInAt}`;
}

function parseForge2faSessionPayload(
  payload: string,
): { email: string; authSignInAt: string } | null {
  const idx = payload.indexOf(PORTAL_2FA_COOKIE_DELIM);
  if (idx <= 0) return null;
  const email = payload.slice(0, idx);
  const authSignInAt = payload.slice(idx + PORTAL_2FA_COOKIE_DELIM.length);
  if (!email || !authSignInAt) return null;
  return { email, authSignInAt };
}

function forge2faSessionMatches(
  email: string,
  authSignInAt: string | null | undefined,
  parsed: { email: string; authSignInAt: string },
): boolean {
  if (!authSignInAt) return false;
  return (
    normalizeEmail(parsed.email) === normalizeEmail(email) &&
    parsed.authSignInAt === authSignInAt
  );
}

export async function hasValidForgePinSession(
  req: NextRequest,
  email: string,
): Promise<boolean> {
  const token = req.cookies.get(FORGE_PORTAL_PIN_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmail, expRaw] = payload.split(':');
  const exp = Number(expRaw);
  return (
    normalizeEmail(tokenEmail) === normalizeEmail(email) &&
    Number.isFinite(exp) &&
    Date.now() <= exp
  );
}

export async function hasValidForgePinSessionForUser(
  email: string,
): Promise<boolean> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get(FORGE_PORTAL_PIN_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmail, expRaw] = payload.split(':');
  const exp = Number(expRaw);
  return (
    normalizeEmail(tokenEmail) === normalizeEmail(email) &&
    Number.isFinite(exp) &&
    Date.now() <= exp
  );
}

export async function hasValidForgeSetupSession(
  req: NextRequest,
  email: string,
): Promise<boolean> {
  const token = req.cookies.get(FORGE_PORTAL_SETUP_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const [tokenEmail, expRaw] = payload.split(':');
  const exp = Number(expRaw);
  return (
    normalizeEmail(tokenEmail) === normalizeEmail(email) &&
    Number.isFinite(exp) &&
    Date.now() <= exp
  );
}

export async function hasValidForge2faSession(
  req: NextRequest,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<boolean> {
  const token = req.cookies.get(FORGE_PORTAL_2FA_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const parsed = parseForge2faSessionPayload(payload);
  if (!parsed) return false;
  return forge2faSessionMatches(email, authSignInAt, parsed);
}

export async function hasValidForge2faSessionForUser(
  email: string,
  authSignInAt: string | null | undefined,
): Promise<boolean> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get(FORGE_PORTAL_2FA_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const parsed = parseForge2faSessionPayload(payload);
  if (!parsed) return false;
  return forge2faSessionMatches(email, authSignInAt, parsed);
}

function forgeSessionCookieMatches(
  parsed: { email: string; authSignInAt: string },
  email: string,
  authSignInAt: string | null | undefined,
  relaxAuthSignInAt: boolean,
): boolean {
  if (normalizeEmail(parsed.email) !== normalizeEmail(email)) return false;
  if (relaxAuthSignInAt) return true;
  return forge2faSessionMatches(email, authSignInAt, parsed);
}

export async function hasValidForgeGoogleSession(
  req: NextRequest,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<boolean> {
  const token = req.cookies.get(FORGE_PORTAL_GOOGLE_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const parsed = parseForge2faSessionPayload(payload);
  if (!parsed) return false;
  const relax = isForgeLocalDevRequestFromReq(req);
  return forgeSessionCookieMatches(parsed, email, authSignInAt, relax);
}

export async function hasValidForgeGoogleSessionForUser(
  email: string,
  authSignInAt: string | null | undefined,
): Promise<boolean> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get(FORGE_PORTAL_GOOGLE_COOKIE)?.value;
  if (!token) return false;

  const localDev = await isForgeLocalDevRequest();
  if (!authSignInAt && !localDev) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const parsed = parseForge2faSessionPayload(payload);
  if (!parsed) return false;
  return forgeSessionCookieMatches(parsed, email, authSignInAt, localDev);
}

export async function hasValidForgePasswordSession(
  req: NextRequest,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<boolean> {
  const token = req.cookies.get(FORGE_PORTAL_PASSWORD_COOKIE)?.value;
  if (!token) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const parsed = parseForge2faSessionPayload(payload);
  if (!parsed) return false;
  const relax = isForgeLocalDevRequestFromReq(req);
  return forgeSessionCookieMatches(parsed, email, authSignInAt, relax);
}

export async function hasValidForgePasswordSessionForUser(
  email: string,
  authSignInAt: string | null | undefined,
): Promise<boolean> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get(FORGE_PORTAL_PASSWORD_COOKIE)?.value;
  if (!token) return false;

  const localDev = await isForgeLocalDevRequest();
  if (!authSignInAt && !localDev) return false;

  const { payload, valid } = await decodeSignedPortalCookie(token);
  if (!valid) return false;

  const parsed = parseForge2faSessionPayload(payload);
  if (!parsed) return false;
  return forgeSessionCookieMatches(parsed, email, authSignInAt, localDev);
}

export async function setForgeGoogleSessionCookies(
  email: string,
  authSignInAt: string | null | undefined,
): Promise<void> {
  if (!authSignInAt) return;

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const payload = buildForge2faSessionPayload(email, authSignInAt);
  cookieStore.set(FORGE_PORTAL_GOOGLE_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: PORTAL_2FA_COOKIE_MAX_AGE_SEC,
  });
}

export async function attachForgeGoogleSessionCookie(
  response: NextResponse,
  email: string,
  authSignInAt: string | null | undefined,
): Promise<void> {
  if (!authSignInAt) return;

  const payload = buildForge2faSessionPayload(email, authSignInAt);
  response.cookies.set(
    FORGE_PORTAL_GOOGLE_COOKIE,
    await encodeSignedPortalCookie(payload),
    {
      ...cookieBase,
      maxAge: PORTAL_2FA_COOKIE_MAX_AGE_SEC,
    },
  );
}

export async function setForgePasswordSessionCookies(
  email: string,
  authSignInAt: string | null | undefined,
): Promise<void> {
  if (!authSignInAt) return;

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const payload = buildForge2faSessionPayload(email, authSignInAt);
  cookieStore.set(
    FORGE_PORTAL_PASSWORD_COOKIE,
    await encodeSignedPortalCookie(payload),
    {
      ...cookieBase,
      maxAge: PORTAL_2FA_COOKIE_MAX_AGE_SEC,
    },
  );
}

export async function setForgePinSessionCookies(email: string): Promise<void> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const exp = Date.now() + PIN_SESSION_MS;
  const payload = `${normalizeEmail(email)}:${exp}`;
  cookieStore.set(FORGE_PORTAL_PIN_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: Math.floor(PIN_SESSION_MS / 1000),
  });
  cookieStore.delete(FORGE_PORTAL_SETUP_COOKIE);
}

export async function setForgeSetupSessionCookies(email: string): Promise<void> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const exp = Date.now() + SETUP_OK_MS;
  const payload = `${normalizeEmail(email)}:${exp}`;
  cookieStore.set(FORGE_PORTAL_SETUP_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: Math.floor(SETUP_OK_MS / 1000),
  });
}

export async function attachForgeSetupSessionCookie(
  response: NextResponse,
  email: string,
): Promise<void> {
  const exp = Date.now() + SETUP_OK_MS;
  const payload = `${normalizeEmail(email)}:${exp}`;
  response.cookies.set(
    FORGE_PORTAL_SETUP_COOKIE,
    await encodeSignedPortalCookie(payload),
    {
      ...cookieBase,
      maxAge: Math.floor(SETUP_OK_MS / 1000),
    },
  );
}

export async function setForge2faSessionCookies(
  email: string,
  authSignInAt: string | null | undefined,
): Promise<void> {
  if (!authSignInAt) return;

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const payload = buildForge2faSessionPayload(email, authSignInAt);
  cookieStore.set(FORGE_PORTAL_2FA_COOKIE, await encodeSignedPortalCookie(payload), {
    ...cookieBase,
    maxAge: PORTAL_2FA_COOKIE_MAX_AGE_SEC,
  });
}

export async function clearForgePortalSessionCookies(): Promise<void> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  cookieStore.delete(FORGE_PORTAL_PIN_COOKIE);
  cookieStore.delete(FORGE_PORTAL_2FA_COOKIE);
  cookieStore.delete(FORGE_PORTAL_SETUP_COOKIE);
  cookieStore.delete(FORGE_PORTAL_GOOGLE_COOKIE);
  cookieStore.delete(FORGE_PORTAL_PASSWORD_COOKIE);
}

export function clearForgePortalSessionCookiesOnResponse(
  response: NextResponse,
): void {
  response.cookies.delete(FORGE_PORTAL_PIN_COOKIE);
  response.cookies.delete(FORGE_PORTAL_2FA_COOKIE);
  response.cookies.delete(FORGE_PORTAL_SETUP_COOKIE);
  response.cookies.delete(FORGE_PORTAL_GOOGLE_COOKIE);
  response.cookies.delete(FORGE_PORTAL_PASSWORD_COOKIE);
}

export async function resolveForgeAccessGate(
  req: NextRequest,
  email: string,
  authSignInAt?: string | null,
): Promise<ForgeAccessGate> {
  const record = await ensureForgePortalAuthRecord(email);
  const { pathname } = req.nextUrl;

  if (isForgeAccountLocked(record)) {
    return 'locked';
  }

  const hasGoogle = await hasValidForgeGoogleSession(req, email, authSignInAt);
  const hasPassword = await hasValidForgePasswordSession(req, email, authSignInAt);
  const localDevBypass = isForgeLocalDevRequestFromReq(req);
  const credentialsOk = localDevBypass ? hasPassword : hasGoogle && hasPassword;
  if (!credentialsOk) {
    if (pathname === '/login/forge') return 'ok';
    return 'verify_credentials';
  }

  if (localDevBypass && forgeLocalDevSkipsSecurityGates()) {
    return 'ok';
  }

  if (record.needs_pin_setup || !record.pin_hash) {
    if (pathname === '/login/forge/set-pin') return 'ok';
    return 'set_pin';
  }

  if (!record.two_factor_enabled) {
    if (pathname === '/login/forge/setup-2fa') {
      return (await hasValidForgePinSession(req, email)) ? 'ok' : 'verify_pin';
    }
    return 'setup_2fa';
  }

  if (!(await hasValidForge2faSession(req, email, authSignInAt))) {
    if (pathname === '/login/forge/verify-2fa') return 'ok';
    if (pathname === '/login/forge/recover-2fa') {
      return (await hasValidForgePinSession(req, email)) ? 'ok' : 'verify_pin';
    }
    if (!(await hasValidForgePinSession(req, email))) {
      return 'verify_pin';
    }
    return 'verify_2fa';
  }

  if (!record.unlock_code_hash) {
    if (
      pathname === '/login/forge/set-unlock-code' ||
      pathname === '/login/forge/reset-unlock-code' ||
      pathname === '/login/forge/setup-2fa'
    ) {
      return 'ok';
    }
    return 'setup_unlock_code';
  }

  if (await hasValidForgePinSession(req, email)) {
    return 'ok';
  }

  return 'verify_pin';
}

export function forgeGateRedirectPath(gate: ForgeAccessGate): string {
  switch (gate) {
    case 'verify_credentials':
      return '/login/forge';
    case 'set_pin':
      return '/login/forge/set-pin';
    case 'verify_pin':
      return '/login/forge/verify-pin';
    case 'setup_2fa':
      return '/login/forge/setup-2fa';
    case 'verify_2fa':
      return '/login/forge/verify-2fa';
    case 'setup_unlock_code':
      return '/login/forge/set-unlock-code';
    case 'locked':
      return '/login/forge?error=forge_locked';
    default:
      return '/forge';
  }
}

export async function resolveForgePortalEntryPath(
  email: string,
  authSignInAt: string | null | undefined,
): Promise<string> {
  const record = await ensureForgePortalAuthRecord(email);
  const localDevBypass = await import('./forge-local-dev').then((mod) =>
    mod.isForgeLocalDevRequest(),
  );

  if (isForgeAccountLocked(record)) {
    return '/login/forge?error=forge_locked';
  }

  if (
    !localDevBypass &&
    !(await hasValidForgeGoogleSessionForUser(email, authSignInAt))
  ) {
    return '/login/forge';
  }

  if (!(await hasValidForgePasswordSessionForUser(email, authSignInAt))) {
    return '/login/forge';
  }

  if (localDevBypass && forgeLocalDevSkipsSecurityGates()) {
    return '/forge';
  }

  if (record.needs_pin_setup || !record.pin_hash) {
    return '/login/forge/set-pin';
  }

  if (!(await hasValidForgePinSessionForUser(email))) {
    return '/login/forge/verify-pin';
  }

  if (!record.two_factor_enabled) {
    return '/login/forge/setup-2fa';
  }

  if (!(await hasValidForge2faSessionForUser(email, authSignInAt))) {
    return '/login/forge/verify-2fa';
  }

  if (!record.unlock_code_hash) {
    return '/login/forge/set-unlock-code';
  }

  return '/forge';
}

async function recordForgePasswordFailure(
  email: string,
): Promise<{ error: string }> {
  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  const attempts = (record?.failed_password_attempts ?? 0) + 1;
  const service = createSupabaseServiceClient();

  if (attempts >= FORGE_LOCKOUT_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + FORGE_LOCKOUT_MS).toISOString();
    await service
      .from('forge_portal_auth')
      .update({
        failed_password_attempts: attempts,
        is_locked: true,
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('operator_email', normalized);
    return {
      error: 'Too many failed attempts. Forge sign-in locked for 1 hour.',
    };
  }

  await service
    .from('forge_portal_auth')
    .update({
      failed_password_attempts: attempts,
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalized);

  return { error: 'Invalid password.' };
}

async function recordForge2faFailure(email: string): Promise<{ error: string }> {
  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  const attempts = (record?.failed_2fa_attempts ?? 0) + 1;
  const service = createSupabaseServiceClient();

  if (attempts >= FORGE_LOCKOUT_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + FORGE_LOCKOUT_MS).toISOString();
    await service
      .from('forge_portal_auth')
      .update({
        failed_2fa_attempts: attempts,
        is_locked: true,
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('operator_email', normalized);
    return {
      error: 'Too many failed 2FA attempts. Forge sign-in locked for 1 hour.',
    };
  }

  await service
    .from('forge_portal_auth')
    .update({
      failed_2fa_attempts: attempts,
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalized);

  return { error: 'Invalid authenticator or backup code.' };
}

async function clearForgeLoginFailures(email: string): Promise<void> {
  const service = createSupabaseServiceClient();
  await service
    .from('forge_portal_auth')
    .update({
      failed_password_attempts: 0,
      failed_2fa_attempts: 0,
      is_locked: false,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalizeEmail(email));
}

export async function verifyForgeAuthPasswordForSetup(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  if (!record) {
    return { ok: false, error: 'Forge auth record not found.' };
  }

  if (isForgeAccountLocked(record)) {
    return { ok: false, error: 'Account is temporarily locked.' };
  }

  if (!record.needs_pin_setup && record.pin_hash) {
    return { ok: false, error: 'Password is already set.' };
  }

  const { createSupabaseServerClient } = await import(
    '../../../packages/supabase/server'
  );
  const supabase = await createSupabaseServerClient();
  let { error } = await supabase.auth.signInWithPassword({
    email: normalized,
    password,
  });

  if (
    error &&
    record.needs_pin_setup &&
    password.length === FORGE_TEMP_PASSWORD_LENGTH &&
    /^\d+$/.test(password)
  ) {
    const sync = await syncForgeSupabaseAuthPassword(normalized, password);
    if (sync.ok) {
      ({ error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      }));
    }
  }

  if (error) {
    const failure = await recordForgePasswordFailure(normalized);
    return { ok: false, error: failure.error };
  }

  await clearForgeLoginFailures(normalized);
  return { ok: true };
}

export async function verifyForgePortalPin(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string; needsPinSetup?: boolean }> {
  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  if (!record) {
    return { ok: false, error: 'Forge auth record not found.' };
  }

  if (isForgeAccountLocked(record)) {
    return { ok: false, error: 'Account is temporarily locked.' };
  }

  if (record.needs_pin_setup || !record.pin_hash) {
    return { ok: false, error: 'Set your permanent password first.', needsPinSetup: true };
  }

  if (!verifyPortalPin(password, record.pin_hash)) {
    const failure = await recordForgePasswordFailure(normalized);
    return { ok: false, error: failure.error };
  }

  await clearForgeLoginFailures(normalized);
  return { ok: true };
}

export async function setForgePortalPin(
  email: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const passwordCheck = validateHeadOfficePortalPassword(newPassword);
  if (!passwordCheck.ok) {
    return { ok: false, error: passwordCheck.error };
  }

  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  if (!record) {
    return { ok: false, error: 'Forge auth record not found.' };
  }
  if (!record.needs_pin_setup && record.pin_hash) {
    return { ok: false, error: 'Password is already set.' };
  }

  const authSync = await syncForgeSupabaseAuthPassword(normalized, newPassword);
  if (!authSync.ok) {
    return { ok: false, error: authSync.error ?? 'Failed to save login password.' };
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('forge_portal_auth')
    .update({
      pin_hash: hashPortalPin(newPassword),
      needs_pin_setup: false,
      temp_password_issued_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalized);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function beginForgeTotpSetup(
  email: string,
): Promise<{ ok: boolean; secret?: string; uri?: string; error?: string }> {
  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  if (!record?.pin_hash) {
    return { ok: false, error: 'Set your login password first.' };
  }

  const secret = generateHeadOfficeTotpSecret();
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('forge_portal_auth')
    .update({
      totp_secret: encryptHeadOfficeTotpSecret(secret),
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalized);

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    secret,
    uri: buildHeadOfficeTotpUri(secret, normalized, 'Pearzen Forge'),
  };
}

export async function confirmForgeTotpSetup(
  email: string,
  code: string,
): Promise<{ ok: boolean; backupCodes?: string[]; error?: string }> {
  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  if (!record?.totp_secret) {
    return { ok: false, error: 'Start 2FA setup again.' };
  }

  const secret = decryptHeadOfficeTotpSecret(record.totp_secret);
  if (!secret || !verifyHeadOfficeTotpCode(secret, code)) {
    return { ok: false, error: 'Invalid authenticator code.' };
  }

  const backupCodes = generateForgeBackupCodes();
  const backupHashes = backupCodes.map((entry) => hashForgeBackupCode(entry));
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('forge_portal_auth')
    .update({
      two_factor_enabled: true,
      totp_backup_code_hashes: backupHashes,
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalized);

  if (error) return { ok: false, error: error.message };
  return { ok: true, backupCodes };
}

export async function verifyForgeTotpLogin(
  email: string,
  code: string,
  authSignInAt: string | null | undefined,
): Promise<{ ok: boolean; error?: string; usedBackup?: boolean }> {
  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  if (!record?.two_factor_enabled || !record.totp_secret) {
    return { ok: false, error: '2FA is not enabled.' };
  }

  const secret = decryptHeadOfficeTotpSecret(record.totp_secret);
  if (secret && verifyHeadOfficeTotpCode(secret, code)) {
    await clearForgeLoginFailures(normalized);
    await setForge2faSessionCookies(normalized, authSignInAt);
    return { ok: true };
  }

  const hashes = record.totp_backup_code_hashes;
  const backupMatch = verifyForgeBackupCode(code, hashes);
  if (!backupMatch.valid) {
    const failure = await recordForge2faFailure(normalized);
    return { ok: false, error: failure.error };
  }

  const remaining = hashes.filter((_, index) => index !== backupMatch.index);
  const service = createSupabaseServiceClient();
  await service
    .from('forge_portal_auth')
    .update({
      totp_backup_code_hashes: remaining,
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalized);

  await startOd2faRecoveryLockout(normalized);
  await clearForgeLoginFailures(normalized);
  await setForge2faSessionCookies(normalized, authSignInAt);
  return { ok: true, usedBackup: true };
}

/** Password + TOTP step-up for sensitive account changes (no backup codes). */
export async function verifyForgeTotpStepUp(
  email: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizeEmail(email);
  const record = await getForgePortalAuthRecord(normalized);
  if (!record?.two_factor_enabled || !record.totp_secret) {
    return { ok: false, error: '2FA is not enabled.' };
  }

  const secret = decryptHeadOfficeTotpSecret(record.totp_secret);
  if (!secret || !verifyHeadOfficeTotpCode(secret, code)) {
    const failure = await recordForge2faFailure(normalized);
    return { ok: false, error: failure.error };
  }

  return { ok: true };
}

export async function setForgeUnlockCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const validation = validatePortalUnlockCode(code);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('forge_portal_auth')
    .update({
      unlock_code_hash: hashPortalUnlockCode(code),
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalizeEmail(email));

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function verifyForgeUnlockCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const record = await getForgePortalAuthRecord(email);
  if (!record?.unlock_code_hash) {
    return { ok: false, error: 'Unlock code is not set.' };
  }

  if (!verifyPortalUnlockCode(code, record.unlock_code_hash)) {
    return { ok: false, error: 'Invalid unlock code.' };
  }

  return { ok: true };
}

export async function resetForgeUnlockCodeWithPassword(
  email: string,
  password: string,
  newCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const pinCheck = await verifyForgePortalPin(email, password);
  if (!pinCheck.ok) {
    return { ok: false, error: pinCheck.error ?? 'Invalid password.' };
  }

  return setForgeUnlockCode(email, newCode);
}

/** When an incumbent rejects a concurrent Forge login, the challenger must re-provision. */
export async function invalidateForgePasswordAfterRejectedLogin(
  operatorEmail: string,
): Promise<void> {
  const normalized = normalizeEmail(operatorEmail);
  const record = await getForgePortalAuthRecord(normalized);
  if (!record) return;

  const revokedPassword = generateForgeTempPassword().slice(0, 24);
  await syncForgeSupabaseAuthPassword(normalized, revokedPassword);

  const service = createSupabaseServiceClient();
  await service
    .from('forge_portal_auth')
    .update({
      pin_hash: null,
      needs_pin_setup: true,
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalized);
}

export async function issueForgeTempPasswordReset(
  email: string,
): Promise<{
  ok: boolean;
  emailed?: boolean;
  error?: string;
}> {
  const normalized = normalizeEmail(email);
  if (!(await isForgeOperatorEmail(normalized))) {
    return { ok: false, error: 'This email is not authorised for Forge.' };
  }

  const record = await ensureForgePortalAuthRecord(normalized);
  const deliveryEmail =
    record.recovery_email?.trim() ||
    record.main_email?.trim() ||
    normalized;

  const tempPassword = generateForgeTempPassword();
  const authSync = await syncForgeSupabaseAuthPassword(normalized, tempPassword);
  if (!authSync.ok) {
    return { ok: false, error: authSync.error ?? 'Could not set temporary password.' };
  }

  const service = createSupabaseServiceClient();
  await service
    .from('forge_portal_auth')
    .update({
      pin_hash: null,
      needs_pin_setup: true,
      unlock_code_hash: null,
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      temp_password_issued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalized);

  const mail = await sendForgeTempPasswordEmail({
    to: deliveryEmail,
    tempPassword,
    operatorEmail: normalized,
  });

  if (!mail.ok) {
    return { ok: false, error: mail.error };
  }
  if (!mail.emailed) {
    return {
      ok: false,
      error: 'Email delivery is not configured. Set RESEND_API_KEY and FORGE_EMAIL_FROM.',
    };
  }

  return {
    ok: true,
    emailed: true,
  };
}

export async function canRequestForge2faEmailRecovery(
  email: string,
): Promise<{ ok: boolean; error?: string; hoursLeft?: number }> {
  const record = await getForgePortalAuthRecord(email);
  if (!record?.od_2fa_recovery_locked_until) {
    return { ok: true };
  }

  const remaining =
    new Date(record.od_2fa_recovery_locked_until).getTime() - Date.now();
  if (remaining <= 0) {
    return { ok: true };
  }

  const hoursLeft = Math.ceil(remaining / (60 * 60 * 1000));
  return {
    ok: false,
    hoursLeft,
    error: `Email recovery is cooling down. Try again in ${hoursLeft} hour(s).`,
  };
}

export async function resetForgeTwoFactor(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const cooldown = await canRequestForge2faEmailRecovery(email);
  if (!cooldown.ok) {
    return { ok: false, error: cooldown.error };
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('forge_portal_auth')
    .update({
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      updated_at: new Date().toISOString(),
    })
    .eq('operator_email', normalizeEmail(email));

  if (error) return { ok: false, error: error.message };
  await clearForgePortalSessionCookies();
  return { ok: true };
}
