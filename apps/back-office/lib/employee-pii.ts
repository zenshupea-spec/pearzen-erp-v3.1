import { assertEncryptionKeyConfigured, decrypt, encrypt, looksEncrypted } from './encryption';

/**
 * Master Nominal Roll PII at rest (AES-256-CBC, `ivHex:ciphertextHex`).
 *
 * Plaintext by design (portal login / roster lookup):
 * - `epf_no`, `emp_number` — guard, SM, and HO portal authentication
 * - `full_name`, `email`, `dob`, `gender`, `nationality`, `religion` — operational display
 */
export const ENCRYPTED_EMPLOYEE_PII_FIELDS = [
  'nic',
  'phone',
  'passport_no',
  'home_address',
  'bank_code',
  'branch_code',
  'account_number',
] as const;

export type EncryptedEmployeePiiField = (typeof ENCRYPTED_EMPLOYEE_PII_FIELDS)[number];

export function assertEmployeePiiEncryptionReady(): void {
  if (process.env.NODE_ENV !== 'production') {
    if (!process.env.ENCRYPTION_KEY?.trim()) {
      console.warn(
        '[employee-pii] ENCRYPTION_KEY not set — PII will be stored in plaintext during local dev.',
      );
    }
    return;
  }
  assertEncryptionKeyConfigured();
}

export function getEmployeePiiEncryptionError(): string | null {
  try {
    assertEmployeePiiEncryptionReady();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Employee PII encryption is unavailable.';
  }
}

export function encryptEmployeePiiValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  if (!str) return null;

  if (process.env.NODE_ENV === 'production') {
    assertEncryptionKeyConfigured();
  }

  const encrypted = encrypt(str);
  if (process.env.NODE_ENV === 'production' && !looksEncrypted(encrypted)) {
    throw new Error(
      'Employee PII could not be encrypted. Configure ENCRYPTION_KEY to a 32-character value.',
    );
  }
  return encrypted;
}

export function decryptEmployeePiiValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  return decrypt(String(value));
}

export function encryptEmployeePiiRecord<T extends Record<string, unknown>>(record: T): T {
  assertEmployeePiiEncryptionReady();
  const out = { ...record };
  for (const field of ENCRYPTED_EMPLOYEE_PII_FIELDS) {
    if (!(field in out)) continue;
    const raw = out[field];
    if (raw == null || raw === '') {
      out[field] = null as T[typeof field];
      continue;
    }
    out[field] = encryptEmployeePiiValue(raw) as T[typeof field];
  }
  return out;
}

export function decryptEmployeePiiRecord<T extends Record<string, unknown>>(record: T): T {
  const out = { ...record };
  for (const field of ENCRYPTED_EMPLOYEE_PII_FIELDS) {
    if (!(field in out) || out[field] == null || out[field] === '') continue;
    out[field] = decryptEmployeePiiValue(out[field]) as T[typeof field];
  }
  return out;
}
