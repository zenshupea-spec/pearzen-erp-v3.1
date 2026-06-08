import { decrypt, encrypt } from './encryption';

/** Fields stored AES-256-CBC encrypted at rest in employees (Master Nominal Roll). */
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

export function encryptEmployeePiiValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  if (!str) return null;
  return encrypt(str);
}

export function decryptEmployeePiiValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  return decrypt(String(value));
}

export function encryptEmployeePiiRecord<T extends Record<string, unknown>>(record: T): T {
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
