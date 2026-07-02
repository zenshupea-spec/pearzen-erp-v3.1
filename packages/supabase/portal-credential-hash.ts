import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const CREDENTIAL_ITERATIONS = 100_000;

/** PBKDF2 hash for portal passwords and SM PINs stored in history / HO auth tables. */
export function hashPortalCredential(credential: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(credential, salt, CREDENTIAL_ITERATIONS, 32, 'sha256').toString(
    'hex',
  );
  return `${salt}:${hash}`;
}

export function verifyPortalCredential(credential: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = pbkdf2Sync(credential, salt, CREDENTIAL_ITERATIONS, 32, 'sha256').toString(
    'hex',
  );
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}
