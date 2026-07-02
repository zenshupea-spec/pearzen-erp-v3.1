import { isSectorManagerEmployee } from './hr-sectors';
import { normalizePortalRole } from './portal-role-utils';

/** Head Office ranks that may omit work email (non–back-office portal staff). */
export const HEAD_OFFICE_OPTIONAL_WORK_EMAIL_RANKS = [
  'DRIVER',
  'CARETAKER',
  'SHALOM_CARETAKER',
] as const;

/** Sector managers, drivers, caretakers, and unassigned HO rank may skip work email. */
export function isHeadOfficeWorkEmailOptionalRank(
  rank: string | null | undefined,
): boolean {
  const normalized = normalizePortalRole(rank);
  if (!normalized) return true;
  if (normalized === 'SM') return true;
  return (HEAD_OFFICE_OPTIONAL_WORK_EMAIL_RANKS as readonly string[]).includes(
    normalized,
  );
}

/** MNR personal tab — HO portal login email (hidden for sector managers). */
export function showHeadOfficeWorkEmailInMnr(row: {
  group?: string | null;
  rank?: string | null;
}): boolean {
  const group = String(row.group ?? '').trim().toUpperCase();
  if (group !== 'HEAD_OFFICE') return false;
  return !isSectorManagerEmployee(row);
}

export function isHeadOfficeWorkEmailRequired(
  rank: string | null | undefined,
): boolean {
  return !isHeadOfficeWorkEmailOptionalRank(rank);
}
