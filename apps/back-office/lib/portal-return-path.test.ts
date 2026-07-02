import { describe, expect, it } from 'vitest';

import { resolveSafePortalReturnPath } from './portal-return-path';

describe('resolveSafePortalReturnPath', () => {
  it('returns fallback for missing or unsafe values', () => {
    expect(resolveSafePortalReturnPath(null, '/dashboard')).toBe('/dashboard');
    expect(resolveSafePortalReturnPath('https://evil.test/om', '/dashboard')).toBe(
      '/dashboard',
    );
    expect(resolveSafePortalReturnPath('//evil.test/om', '/dashboard')).toBe('/dashboard');
    expect(resolveSafePortalReturnPath('/login/hq', '/dashboard')).toBe('/dashboard');
    expect(resolveSafePortalReturnPath('/account/change-password', '/dashboard')).toBe(
      '/dashboard',
    );
  });

  it('allows internal portal paths', () => {
    expect(resolveSafePortalReturnPath('/om', '/dashboard')).toBe('/om');
    expect(resolveSafePortalReturnPath('/hq/deductions', '/dashboard')).toBe(
      '/hq/deductions',
    );
  });
});
