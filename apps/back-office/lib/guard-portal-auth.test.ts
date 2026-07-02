import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authLocalPartsForEmployee,
  canonicalEpfFromEmployee,
  epfAuthLocalPart,
  fieldPwaAuthEmail,
  fieldPwaAuthPassword,
  guardLoginEpfFromFormData,
  guardRosterKey,
  isEmployeeActive,
  normalizeEpfNo,
  type GuardEmployeeRow,
} from '../../field-pwa/lib/guard-auth-shared';

const activeGuard: GuardEmployeeRow = {
  id: 'emp-1',
  full_name: 'Guard One',
  emp_number: 'G-001',
  epf_no: '12345',
  epf_num: '12345',
  status: 'ACTIVE',
  company_id: 'company-1',
};

describe('guard portal auth — EPF-only login surface', () => {
  it('requires EPF and trims whitespace', () => {
    const fd = new FormData();
    fd.set('epfNo', '  12345  ');
    expect(guardLoginEpfFromFormData(fd)).toEqual({ ok: true, epf: '12345' });
  });

  it('rejects empty EPF', () => {
    const fd = new FormData();
    expect(guardLoginEpfFromFormData(fd)).toEqual({
      ok: false,
      error: 'EPF number is required.',
    });
  });

  it('ignores password and PIN fields — credentials are server-side only', () => {
    const fd = new FormData();
    fd.set('epfNo', '12345');
    fd.set('password', 'user-entered-password');
    fd.set('pin', '123456');
    expect(guardLoginEpfFromFormData(fd)).toEqual({ ok: true, epf: '12345' });
  });
});

describe('guard portal auth — identity helpers', () => {
  it('builds pearzen.local auth email from EPF', () => {
    expect(fieldPwaAuthEmail('  12345 ')).toBe('12345@pearzen.local');
    expect(epfAuthLocalPart('ABC123')).toBe('abc123');
    expect(normalizeEpfNo('  EPF-9  ')).toBe('EPF-9');
  });

  it('prefers emp_number for roster key when present', () => {
    expect(guardRosterKey(activeGuard)).toBe('G-001');
    expect(canonicalEpfFromEmployee(activeGuard)).toBe('12345');
  });

  it('collects auth local parts for EPF and emp_number aliases', () => {
    expect(authLocalPartsForEmployee(activeGuard)).toEqual(['12345', 'g-001']);
  });

  it('treats only ACTIVE employees as sign-in eligible', () => {
    expect(isEmployeeActive(activeGuard)).toBe(true);
    expect(isEmployeeActive({ ...activeGuard, status: 'RESIGNED' })).toBe(false);
  });
});

describe('guard portal auth — server-side password', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllEnvs();
  });

  it('uses FIELD_PWA_AUTH_PASSWORD when configured', () => {
    vi.stubEnv('FIELD_PWA_AUTH_PASSWORD', 'tenant-secret');
    expect(fieldPwaAuthPassword('12345')).toBe('tenant-secret');
  });

  it('pads short dev template passwords to Supabase minimum length', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FIELD_PWA_AUTH_PASSWORD', '');
    vi.stubEnv('FIELD_PWA_AUTH_PASSWORD_TEMPLATE', 'epf');
    expect(fieldPwaAuthPassword('12345').length).toBeGreaterThanOrEqual(6);
  });
});
