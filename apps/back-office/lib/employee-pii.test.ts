import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  encryptEmployeePiiRecord,
  encryptEmployeePiiValue,
  getEmployeePiiEncryptionError,
} from './employee-pii';
import { looksEncrypted } from './encryption';

const TEST_KEY = '12345678901234567890123456789012';

describe('employee PII encryption', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stores iv:cipher values when ENCRYPTION_KEY is configured', () => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
    vi.stubEnv('NODE_ENV', 'development');

    const encrypted = encryptEmployeePiiValue('123456789V');
    expect(encrypted).toBeTruthy();
    expect(looksEncrypted(encrypted!)).toBe(true);
  });

  it('blocks production writes when ENCRYPTION_KEY is missing', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');

    expect(getEmployeePiiEncryptionError()).toMatch(/32 characters/);
    expect(() =>
      encryptEmployeePiiRecord({ nic: '123456789V', phone: '0771234567' }),
    ).toThrow(/32 characters/);
  });

  it('encrypts all configured employee PII fields in a record', () => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
    vi.stubEnv('NODE_ENV', 'production');

    const record = encryptEmployeePiiRecord({
      nic: '123456789V',
      phone: '0771234567',
      epf_no: 'EPF12345',
      bank_code: '7010',
    });

    expect(looksEncrypted(String(record.nic))).toBe(true);
    expect(looksEncrypted(String(record.phone))).toBe(true);
    expect(looksEncrypted(String(record.bank_code))).toBe(true);
    expect(record.epf_no).toBe('EPF12345');
  });
});
