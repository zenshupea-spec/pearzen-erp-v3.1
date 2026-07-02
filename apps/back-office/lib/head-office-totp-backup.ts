import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

import {
  HO_PORTAL_BACKUP_CODE_COUNT,
  normalizeHeadOfficeBackupCode,
} from './head-office-totp-backup-client';

export {
  formatHeadOfficeBackupCode,
  HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT,
  HO_PORTAL_BACKUP_CODE_COUNT,
  HEAD_OFFICE_NO_BACKUP_CODES_ERROR,
  HEAD_OFFICE_RECOVER_2FA_REQUIRES_BACKUP_USE_ERROR,
  isHeadOfficeBackupCodeInput,
  normalizeHeadOfficeBackupCode,
} from './head-office-totp-backup-client';

const BACKUP_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BACKUP_CODE_LENGTH = 8;
const BACKUP_ITERATIONS = 100_000;

function randomBackupCode(): string {
  const bytes = randomBytes(BACKUP_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < BACKUP_CODE_LENGTH; i += 1) {
    code += BACKUP_CHARSET[bytes[i] % BACKUP_CHARSET.length];
  }
  return code;
}

export function generateHeadOfficeBackupCodes(
  count = HO_PORTAL_BACKUP_CODE_COUNT,
): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(randomBackupCode());
  }
  return Array.from(codes);
}

export function hashHeadOfficeBackupCode(code: string): string {
  const normalized = normalizeHeadOfficeBackupCode(code);
  if (!normalized) {
    throw new Error('Invalid backup code.');
  }
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(normalized, salt, BACKUP_ITERATIONS, 32, 'sha256').toString(
    'hex',
  );
  return `${salt}:${hash}`;
}

export function verifyHeadOfficeBackupCode(
  code: string,
  hashes: string[],
): { valid: boolean; index: number } {
  const normalized = normalizeHeadOfficeBackupCode(code);
  if (!normalized) return { valid: false, index: -1 };

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
