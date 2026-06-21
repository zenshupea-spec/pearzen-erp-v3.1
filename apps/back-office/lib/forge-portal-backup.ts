import { pbkdf2Sync, randomInt, timingSafeEqual } from 'crypto';

export const FORGE_BACKUP_CODE_LENGTH = 20;
export const FORGE_BACKUP_CODE_COUNT = 5;

const BACKUP_ITERATIONS = 100_000;

function generateForgeBackupCode(): string {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < FORGE_BACKUP_CODE_LENGTH; i += 1) {
    out += digits[randomInt(0, digits.length)];
  }
  return out;
}

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

export function generateForgeBackupCodes(
  count = FORGE_BACKUP_CODE_COUNT,
): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateForgeBackupCode());
  }
  return Array.from(codes);
}

export function hashForgeBackupCode(code: string): string {
  const normalized = normalizeForgeBackupCode(code);
  if (normalized.length !== FORGE_BACKUP_CODE_LENGTH) {
    throw new Error('Invalid backup code.');
  }
  const salt = randomInt(0, 2 ** 32).toString(16).padStart(8, '0');
  const hash = pbkdf2Sync(normalized, salt, BACKUP_ITERATIONS, 32, 'sha256').toString(
    'hex',
  );
  return `${salt}:${hash}`;
}

export function verifyForgeBackupCode(
  code: string,
  hashes: string[],
): { valid: boolean; index: number } {
  const normalized = normalizeForgeBackupCode(code);
  if (normalized.length !== FORGE_BACKUP_CODE_LENGTH) {
    return { valid: false, index: -1 };
  }

  for (let index = 0; index < hashes.length; index += 1) {
    const stored = hashes[index];
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) continue;
    const derived = pbkdf2Sync(normalized, salt, BACKUP_ITERATIONS, 32, 'sha256').toString(
      'hex',
    );
    try {
      if (timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'))) {
        return { valid: true, index };
      }
    } catch {
      if (hash === derived) return { valid: true, index };
    }
  }

  return { valid: false, index: -1 };
}
