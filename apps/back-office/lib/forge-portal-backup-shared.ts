export const FORGE_BACKUP_CODE_LENGTH = 20;
export const FORGE_BACKUP_CODE_COUNT = 5;

export function normalizeForgeBackupCode(code: string): string {
  return code.replace(/\D/g, '');
}

export function isForgeBackupCodeInput(code: string): boolean {
  return normalizeForgeBackupCode(code).length === FORGE_BACKUP_CODE_LENGTH;
}

export function formatForgeBackupCode(code: string): string {
  const digits = normalizeForgeBackupCode(code);
  if (digits.length !== FORGE_BACKUP_CODE_LENGTH) return digits;
  const chunks: string[] = [];
  for (let i = 0; i < digits.length; i += 5) {
    chunks.push(digits.slice(i, i + 5));
  }
  return chunks.join('-');
}
