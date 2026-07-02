export const HO_PORTAL_BACKUP_CODE_COUNT = 5;
const BACKUP_CODE_LENGTH = 8;

export function formatHeadOfficeBackupCode(code: string): string {
  const normalized = normalizeHeadOfficeBackupCode(code);
  if (!normalized) return code;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function normalizeHeadOfficeBackupCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
  if (cleaned.length !== BACKUP_CODE_LENGTH) return null;
  if (!/^[A-Z2-9]+$/.test(cleaned)) return null;
  return cleaned;
}

export function isHeadOfficeBackupCodeInput(input: string): boolean {
  const trimmed = input.trim();
  if (/^\d{6}$/.test(trimmed)) return false;
  return normalizeHeadOfficeBackupCode(trimmed) !== null;
}

export const HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT =
  'Contact Pearzen SaaS Forge to remove 2FA on your tenant if you have lost your authenticator and all backup codes.';

export const HEAD_OFFICE_NO_BACKUP_CODES_ERROR = `No backup codes remain for this account. ${HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT}`;

export const HEAD_OFFICE_RECOVER_2FA_REQUIRES_BACKUP_USE_ERROR = `Self-service 2FA recovery is only available after you have used a backup code. ${HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT}`;

export const HEAD_OFFICE_2FA_RECOVERY_COOLDOWN_ERROR = (hoursLeft: number) =>
  `Email recovery is cooling down after backup-code use. Try again in ${hoursLeft} hour(s), or ${HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT.toLowerCase()}`;
