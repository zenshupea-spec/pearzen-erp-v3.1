import { isExecutiveRank } from './portal-role-utils';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecoveryEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidRecoveryEmailFormat(email: string): boolean {
  const normalized = normalizeRecoveryEmail(email);
  return EMAIL_FORMAT.test(normalized);
}

export function validateExecutiveRecoveryEmail(
  workEmail: string,
  recoveryEmail: string,
): { ok: true; recoveryEmail: string } | { ok: false; error: string } {
  const work = normalizeRecoveryEmail(workEmail);
  const recovery = normalizeRecoveryEmail(recoveryEmail);

  if (!recovery) {
    return { ok: false, error: 'Recovery email is required for MD and OD.' };
  }
  if (!isValidRecoveryEmailFormat(recovery)) {
    return { ok: false, error: 'Enter a valid recovery email address.' };
  }
  if (!isValidRecoveryEmailFormat(work)) {
    return { ok: false, error: 'Work email on the MNR record is invalid.' };
  }
  if (recovery === work) {
    return {
      ok: false,
      error: 'Recovery email must be different from the work email.',
    };
  }

  return { ok: true, recoveryEmail: recovery };
}

export function validateExecutiveWorkEmailChange(input: {
  currentWorkEmail: string;
  recoveryEmail: string | null;
  newWorkEmail: string;
}): { ok: true; workEmail: string } | { ok: false; error: string } {
  const currentWork = normalizeRecoveryEmail(input.currentWorkEmail);
  const work = normalizeRecoveryEmail(input.newWorkEmail);

  if (!work) {
    return { ok: false, error: 'Work email is required.' };
  }
  if (!isValidRecoveryEmailFormat(work)) {
    return { ok: false, error: 'Enter a valid work email address.' };
  }
  if (work === currentWork) {
    return { ok: false, error: 'That is already your work email.' };
  }

  const recovery = input.recoveryEmail
    ? normalizeRecoveryEmail(input.recoveryEmail)
    : null;
  if (recovery && work === recovery) {
    return {
      ok: false,
      error: 'Work email must be different from your recovery email.',
    };
  }

  return { ok: true, workEmail: work };
}

export function requiresExecutiveRecoveryEmail(
  rank: string | null | undefined,
): boolean {
  return isExecutiveRank(rank);
}

export function hasExecutiveRecoveryEmailOnRecord(
  authRecord: { recovery_email?: string | null } | null | undefined,
): boolean {
  const recovery = authRecord?.recovery_email?.trim();
  return Boolean(recovery && isValidRecoveryEmailFormat(recovery));
}

/** Mask a recovery inbox for roster views (e.g. p•••n@gmail.com). */
export function maskRecoveryEmail(email: string | null | undefined): string {
  const normalized = normalizeRecoveryEmail(email ?? '');
  if (!normalized) return 'Not set';

  const at = normalized.indexOf('@');
  if (at <= 0) return '•••';

  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!domain) return '•••';

  let maskedLocal: string;
  if (local.length <= 1) {
    maskedLocal = '•';
  } else if (local.length === 2) {
    maskedLocal = `${local[0]}•`;
  } else {
    const middleDots = '•'.repeat(Math.min(local.length - 2, 4));
    maskedLocal = `${local[0]}${middleDots}${local.slice(-1)}`;
  }

  return `${maskedLocal}@${domain}`;
}

export function executiveRecoveryEmailDraft(
  draftByEmployeeId: Record<string, string>,
  employeeId: string,
  recoveryOnRecord: string | null | undefined,
): string {
  const draft = draftByEmployeeId[employeeId];
  if (typeof draft === 'string' && draft.trim()) return draft.trim();
  return recoveryOnRecord?.trim() ?? '';
}

export function executiveMissingRecoveryEmail(
  rank: string | null | undefined,
  recoveryEmail: string | null | undefined,
): boolean {
  if (!requiresExecutiveRecoveryEmail(rank)) return false;
  return !hasExecutiveRecoveryEmailOnRecord({ recovery_email: recoveryEmail });
}
