import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CAFE_FRONT_AUTH_EMAIL_DOMAIN,
  cafeFrontAuthEmail,
  cafeFrontAuthPassword,
  isCafeFrontAuthEmail,
  isCafeEmployee,
  normalizeEpfNo,
} from './cafe-front-auth-shared';

describe('cafe-front-auth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses dedicated @pearzen.cafe auth email domain', () => {
    expect(cafeFrontAuthEmail('15')).toBe(`15@${CAFE_FRONT_AUTH_EMAIL_DOMAIN}`);
    expect(isCafeFrontAuthEmail('15@pearzen.cafe')).toBe(true);
    expect(isCafeFrontAuthEmail('15@pearzen.local')).toBe(false);
  });

  it('reads CAFE_FRONT_AUTH_PASSWORD instead of FIELD_PWA_AUTH_PASSWORD', () => {
    vi.stubEnv('FIELD_PWA_AUTH_PASSWORD', 'guard-secret');
    vi.stubEnv('CAFE_FRONT_AUTH_PASSWORD', 'cafe-secret');

    expect(cafeFrontAuthPassword('15')).toBe('cafe-secret');
  });

  it('normalizes EPF to uppercase tenant-safe keys', () => {
    expect(normalizeEpfNo(' 15 ')).toBe('15');
  });

  it('accepts only CAFE group employees', () => {
    expect(isCafeEmployee({ group: 'CAFE' } as never)).toBe(true);
    expect(isCafeEmployee({ group: 'GUARD_FIELD' } as never)).toBe(false);
  });
});
