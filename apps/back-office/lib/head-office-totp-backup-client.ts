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
