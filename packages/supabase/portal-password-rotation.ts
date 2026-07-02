import type { SupabaseClient } from '@supabase/supabase-js';

import { hashPortalCredential, verifyPortalCredential } from './portal-credential-hash';

export const PORTAL_PASSWORD_MAX_AGE_DAYS = 60;
export const PORTAL_PASSWORD_HISTORY_DEPTH = 5;
export const PORTAL_PASSWORD_EXPIRY_WARN_DAYS = 14;
export const SM_PORTAL_PIN_LENGTH = 6;

export type PortalCredentialKind = 'head_office' | 'sm';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTimestamp(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when `must_change_*` is set or `expires_at` is in the past. */
export function isPasswordExpired(
  expiresAt: string | Date | null | undefined,
  mustChange = false,
  now: Date = new Date(),
): boolean {
  if (mustChange) return true;
  if (!expiresAt) return false;
  const expires = parseTimestamp(expiresAt);
  if (!expires) return false;
  return now.getTime() >= expires.getTime();
}

export function computePasswordExpiresAt(
  changedAt: string | Date,
  maxAgeDays: number = PORTAL_PASSWORD_MAX_AGE_DAYS,
): Date {
  const base = parseTimestamp(changedAt);
  if (!base) {
    throw new Error('Invalid password changed timestamp.');
  }
  return new Date(base.getTime() + maxAgeDays * MS_PER_DAY);
}

export function getDaysUntilExpiry(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiresAt) return null;
  const expires = parseTimestamp(expiresAt);
  if (!expires) return null;
  return Math.ceil((expires.getTime() - now.getTime()) / MS_PER_DAY);
}

export function isPasswordExpiryWarning(
  daysUntilExpiry: number | null,
  warnDays: number = PORTAL_PASSWORD_EXPIRY_WARN_DAYS,
): boolean {
  if (daysUntilExpiry === null) return false;
  return daysUntilExpiry <= warnDays;
}

export function isRepeatedPin(pin: string): boolean {
  return /^(\d)\1{5}$/.test(pin.trim());
}

export function isSequentialPin(pin: string): boolean {
  const trimmed = pin.trim();
  if (!new RegExp(`^\\d{${SM_PORTAL_PIN_LENGTH}}$`).test(trimmed)) return false;
  const digits = trimmed.split('').map((char) => Number(char));
  let ascending = true;
  let descending = true;
  for (let index = 1; index < digits.length; index += 1) {
    if (digits[index] !== digits[index - 1]! + 1) ascending = false;
    if (digits[index] !== digits[index - 1]! - 1) descending = false;
  }
  return ascending || descending;
}

export function validateSmPortalPin(
  pin: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = pin.trim();
  if (!new RegExp(`^\\d{${SM_PORTAL_PIN_LENGTH}}$`).test(trimmed)) {
    return { ok: false, error: 'PIN must be exactly 6 digits.' };
  }
  if (isRepeatedPin(trimmed)) {
    return { ok: false, error: 'PIN cannot be six identical digits.' };
  }
  if (isSequentialPin(trimmed)) {
    return { ok: false, error: 'PIN cannot be a sequential number.' };
  }
  return { ok: true };
}

export function assertNotReusedPassword(
  newCredential: string,
  options: {
    currentHash?: string | null;
    historyHashes?: string[];
    historyDepth?: number;
    credentialLabel?: 'password' | 'PIN';
  },
): { ok: true } | { ok: false; error: string } {
  const {
    currentHash,
    historyHashes = [],
    historyDepth = PORTAL_PASSWORD_HISTORY_DEPTH,
    credentialLabel = 'password',
  } = options;
  const label = credentialLabel === 'PIN' ? 'PIN' : 'password';
  const article = credentialLabel === 'PIN' ? 'a' : 'a';

  if (currentHash && verifyPortalCredential(newCredential, currentHash)) {
    return {
      ok: false,
      error: `New ${label} cannot match your current ${label}.`,
    };
  }

  for (const historicHash of historyHashes.slice(0, historyDepth)) {
    if (historicHash && verifyPortalCredential(newCredential, historicHash)) {
      return {
        ok: false,
        error: `You cannot reuse ${article} recent ${label}. Choose one you have not used before.`,
      };
    }
  }

  return { ok: true };
}

export async function fetchPortalPasswordHistoryHashes(
  admin: SupabaseClient,
  employeeId: string,
  portalKind: PortalCredentialKind,
  depth: number = PORTAL_PASSWORD_HISTORY_DEPTH,
): Promise<string[]> {
  const { data, error } = await admin
    .from('portal_password_history')
    .select('credential_hash')
    .eq('employee_id', employeeId)
    .eq('portal_kind', portalKind)
    .order('created_at', { ascending: false })
    .limit(depth);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => (typeof row.credential_hash === 'string' ? row.credential_hash : ''))
    .filter(Boolean);
}

/** Append the previous credential hash before rotating to a new value. */
export async function recordPasswordHistory(
  admin: SupabaseClient,
  input: {
    employeeId: string;
    portalKind: PortalCredentialKind;
    previousCredentialHash: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from('portal_password_history').insert({
    employee_id: input.employeeId,
    portal_kind: input.portalKind,
    credential_hash: input.previousCredentialHash,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/** Remove stored credential hashes after HR/MD reset or forced rotation. */
export async function clearPortalPasswordHistory(
  admin: SupabaseClient,
  employeeId: string,
  portalKind: PortalCredentialKind,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin
    .from('portal_password_history')
    .delete()
    .eq('employee_id', employeeId)
    .eq('portal_kind', portalKind);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export function hashPortalCredentialForStorage(credential: string): string {
  return hashPortalCredential(credential);
}

export { hashPortalCredential, verifyPortalCredential };
