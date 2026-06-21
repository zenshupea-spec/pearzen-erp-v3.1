import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { normalizePortalRole } from './portal-role-utils';

export const PORTAL_MAX_FAILED_ATTEMPTS = 3;
export const OD_TIMED_LOCK_MS = 60 * 60 * 1000;
export const OD_2FA_RECOVERY_LOCK_MS = 120 * 60 * 60 * 1000;

export type PortalLockoutState = {
  isLocked: boolean;
  lockedUntil: string | null;
  failedPasswordAttempts: number;
  failed2faAttempts: number;
  isUsernameLocked: boolean;
  od2faRecoveryLockedUntil: string | null;
};

function mapLockoutRow(data: Record<string, unknown> | null): PortalLockoutState {
  if (!data) {
    return {
      isLocked: false,
      lockedUntil: null,
      failedPasswordAttempts: 0,
      failed2faAttempts: 0,
      isUsernameLocked: false,
      od2faRecoveryLockedUntil: null,
    };
  }
  return {
    isLocked: Boolean(data.is_username_locked),
    lockedUntil:
      typeof data.locked_until === 'string' ? data.locked_until : null,
    failedPasswordAttempts: Number(data.failed_password_attempts ?? 0),
    failed2faAttempts: Number(data.failed_2fa_attempts ?? 0),
    isUsernameLocked: Boolean(data.is_username_locked),
    od2faRecoveryLockedUntil:
      typeof data.od_2fa_recovery_locked_until === 'string'
        ? data.od_2fa_recovery_locked_until
        : null,
  };
}

export async function getPortalLockoutState(
  employeeId: string,
): Promise<PortalLockoutState> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('head_office_portal_auth')
    .select(
      'failed_password_attempts, failed_2fa_attempts, is_username_locked, locked_until, od_2fa_recovery_locked_until',
    )
    .eq('employee_id', employeeId)
    .maybeSingle();

  return mapLockoutRow(data as Record<string, unknown> | null);
}

export function isOdRank(rank: string | null | undefined): boolean {
  return normalizePortalRole(rank) === 'OD';
}

export function isMdRank(rank: string | null | undefined): boolean {
  return normalizePortalRole(rank) === 'MD';
}

function lockoutMessage(
  rank: string | null | undefined,
  state: PortalLockoutState,
): string | null {
  const now = Date.now();

  if (state.od2faRecoveryLockedUntil) {
    const until = new Date(state.od2faRecoveryLockedUntil).getTime();
    if (until > now) {
      const hoursLeft = Math.ceil((until - now) / (60 * 60 * 1000));
      return `Account locked. Request email recovery in ${hoursLeft} hour(s).`;
    }
  }

  if (isOdRank(rank) && state.lockedUntil) {
    const until = new Date(state.lockedUntil).getTime();
    if (until > now) {
      const minsLeft = Math.ceil((until - now) / 60_000);
      return `Too many failed attempts. Try again in ${minsLeft} minute(s).`;
    }
  }

  if (!isOdRank(rank) && state.isUsernameLocked) {
    if (isMdRank(rank)) {
      return 'Account locked. Ask OD to unlock your portal username.';
    }
    return 'Account locked. Ask HR to unlock your portal username.';
  }

  return null;
}

export async function assertPortalLoginNotLocked(
  employeeId: string,
  rank: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = await getPortalLockoutState(employeeId);

  if (isOdRank(rank) && state.lockedUntil) {
    const until = new Date(state.lockedUntil).getTime();
    if (until > now()) {
      return { ok: false, error: lockoutMessage(rank, state)! };
    }
  }

  const message = lockoutMessage(rank, state);
  if (message) return { ok: false, error: message };

  return { ok: true };
}

function now() {
  return Date.now();
}

async function clearOdTimedLockIfExpired(employeeId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('head_office_portal_auth')
    .select('locked_until')
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (!data?.locked_until) return;
  if (new Date(String(data.locked_until)).getTime() <= now()) {
    await service
      .from('head_office_portal_auth')
      .update({ locked_until: null, updated_at: new Date().toISOString() })
      .eq('employee_id', employeeId);
  }
}

export async function recordPortalPasswordFailure(
  employeeId: string,
  rank: string | null | undefined,
): Promise<{ locked: boolean; error: string; attemptsLeft: number }> {
  await clearOdTimedLockIfExpired(employeeId);
  const service = createSupabaseServiceClient();
  const state = await getPortalLockoutState(employeeId);

  if (isOdRank(rank)) {
    const nextAttempts = state.failedPasswordAttempts + 1;
    if (nextAttempts >= PORTAL_MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(now() + OD_TIMED_LOCK_MS).toISOString();
      await service
        .from('head_office_portal_auth')
        .update({
          failed_password_attempts: 0,
          failed_2fa_attempts: 0,
          locked_until: lockedUntil,
          od_timed_lock_strikes: state.failedPasswordAttempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('employee_id', employeeId);
      return {
        locked: true,
        error: 'Too many failed attempts. Try again in 1 hour.',
        attemptsLeft: 0,
      };
    }

    await service
      .from('head_office_portal_auth')
      .update({
        failed_password_attempts: nextAttempts,
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', employeeId);

    return {
      locked: false,
      error: 'Invalid credentials.',
      attemptsLeft: PORTAL_MAX_FAILED_ATTEMPTS - nextAttempts,
    };
  }

  const nextAttempts = state.failedPasswordAttempts + 1;
  const locked = nextAttempts >= PORTAL_MAX_FAILED_ATTEMPTS;

  await service
    .from('head_office_portal_auth')
    .update({
      failed_password_attempts: locked ? 0 : nextAttempts,
      is_username_locked: locked ? true : state.isUsernameLocked,
      updated_at: new Date().toISOString(),
    })
    .eq('employee_id', employeeId);

  if (locked) {
    const msg = isMdRank(rank)
      ? 'Account locked after 3 failed attempts. Ask OD to unlock.'
      : 'Account locked after 3 failed attempts. Ask HR to unlock.';
    return { locked: true, error: msg, attemptsLeft: 0 };
  }

  return {
    locked: false,
    error: `Invalid credentials. ${PORTAL_MAX_FAILED_ATTEMPTS - nextAttempts} attempt(s) left.`,
    attemptsLeft: PORTAL_MAX_FAILED_ATTEMPTS - nextAttempts,
  };
}

export async function recordPortal2faFailure(
  employeeId: string,
  rank: string | null | undefined,
): Promise<{ locked: boolean; error: string; attemptsLeft: number }> {
  await clearOdTimedLockIfExpired(employeeId);
  const service = createSupabaseServiceClient();
  const state = await getPortalLockoutState(employeeId);

  if (isOdRank(rank)) {
    const nextAttempts = state.failed2faAttempts + 1;
    if (nextAttempts >= PORTAL_MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(now() + OD_TIMED_LOCK_MS).toISOString();
      await service
        .from('head_office_portal_auth')
        .update({
          failed_password_attempts: 0,
          failed_2fa_attempts: 0,
          locked_until: lockedUntil,
          od_timed_lock_strikes: (state.failedPasswordAttempts || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('employee_id', employeeId);
      return {
        locked: true,
        error: 'Too many failed 2FA attempts. Try again in 1 hour.',
        attemptsLeft: 0,
      };
    }

    await service
      .from('head_office_portal_auth')
      .update({
        failed_2fa_attempts: nextAttempts,
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', employeeId);

    return {
      locked: false,
      error: 'Invalid code.',
      attemptsLeft: PORTAL_MAX_FAILED_ATTEMPTS - nextAttempts,
    };
  }

  const nextAttempts = state.failed2faAttempts + 1;
  const locked = nextAttempts >= PORTAL_MAX_FAILED_ATTEMPTS;

  await service
    .from('head_office_portal_auth')
    .update({
      failed_2fa_attempts: locked ? 0 : nextAttempts,
      is_username_locked: locked ? true : state.isUsernameLocked,
      updated_at: new Date().toISOString(),
    })
    .eq('employee_id', employeeId);

  if (locked) {
    const msg = isMdRank(rank)
      ? 'Account locked after 3 failed 2FA attempts. Ask OD to unlock.'
      : 'Account locked after 3 failed 2FA attempts. Ask HR to unlock.';
    return { locked: true, error: msg, attemptsLeft: 0 };
  }

  return {
    locked: false,
    error: `Invalid code. ${PORTAL_MAX_FAILED_ATTEMPTS - nextAttempts} attempt(s) left.`,
    attemptsLeft: PORTAL_MAX_FAILED_ATTEMPTS - nextAttempts,
  };
}

export async function clearPortalLoginFailures(employeeId: string): Promise<void> {
  const service = createSupabaseServiceClient();
  await service
    .from('head_office_portal_auth')
    .update({
      failed_password_attempts: 0,
      failed_2fa_attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('employee_id', employeeId);
}

export async function unlockPortalUsername(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('head_office_portal_auth')
    .update({
      is_username_locked: false,
      failed_password_attempts: 0,
      failed_2fa_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('employee_id', employeeId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function canHrUnlockTargetRank(targetRank: string | null | undefined): boolean {
  const rank = normalizePortalRole(targetRank);
  return rank !== 'MD' && rank !== 'OD';
}

export function canOdUnlockTargetRank(targetRank: string | null | undefined): boolean {
  return isMdRank(targetRank) || normalizePortalRole(targetRank) === 'HR';
}

export function canHrProvisionTargetRank(
  actorRank: string | null | undefined,
  targetRank: string | null | undefined,
): boolean {
  const actor = normalizePortalRole(actorRank);
  const target = normalizePortalRole(targetRank);
  if (actor === 'HR') return target !== 'MD' && target !== 'HR';
  if (actor === 'MD' || actor === 'OD') return true;
  return false;
}
