/**
 * Edge-safe Forge portal session gate helpers for middleware.
 * No Node.js `crypto` — cookies use Web Crypto via head-office-portal-cookie-crypto.
 */
import type { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { decodeSignedPortalCookie } from './head-office-portal-cookie-crypto';
import {
  forgeLocalDevSkipsSecurityGates,
  isForgeLocalDevRequest,
  isForgeLocalDevRequestFromReq,
} from './forge-local-dev';

export const FORGE_PORTAL_PIN_COOKIE = 'pz_forge_pin_session';
export const FORGE_PORTAL_2FA_COOKIE = 'pz_forge_2fa_session';
export const FORGE_PORTAL_SETUP_COOKIE = 'pz_forge_setup_ok';
export const FORGE_PORTAL_GOOGLE_COOKIE = 'pz_forge_google_session';
export const FORGE_PORTAL_PASSWORD_COOKIE = 'pz_forge_password_session';

const PORTAL_2FA_COOKIE_DELIM = '|';

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

async function getForgePortalAuthRecord(
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

async function ensureForgePortalAuthRecord(
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

async function hasValidForge2faSession(
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

async function hasValidForgePinSessionForUser(email: string): Promise<boolean> {
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

async function hasValidForge2faSessionForUser(
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

async function hasValidForgeGoogleSessionForUser(
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

async function hasValidForgePasswordSessionForUser(
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

export function clearForgePortalSessionCookiesOnResponse(
  response: NextResponse,
): void {
  response.cookies.delete(FORGE_PORTAL_PIN_COOKIE);
  response.cookies.delete(FORGE_PORTAL_2FA_COOKIE);
  response.cookies.delete(FORGE_PORTAL_SETUP_COOKIE);
  response.cookies.delete(FORGE_PORTAL_GOOGLE_COOKIE);
  response.cookies.delete(FORGE_PORTAL_PASSWORD_COOKIE);
}

export function isForgeGatePath(pathname: string): boolean {
  return (
    pathname === '/login/forge' ||
    pathname.startsWith('/login/forge/') ||
    pathname === '/auth/callback'
  );
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
  const localDevBypass = await isForgeLocalDevRequest();

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
