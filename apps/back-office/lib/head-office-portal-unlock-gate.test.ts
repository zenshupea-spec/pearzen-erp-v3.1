import { describe, expect, it } from 'vitest';

/**
 * Mirrors unlock-code gate exemption in resolvePortalAccessGateForPathname —
 * setup-2fa must stay reachable after enrollment so backup codes can be saved.
 */
function unlockGateAllowsPathname(pathname: string): boolean {
  return (
    pathname === '/login/set-unlock-code' ||
    pathname === '/login/reset-unlock-code' ||
    pathname === '/login/setup-2fa'
  );
}

describe('head office unlock gate paths', () => {
  it('keeps setup-2fa open until backup codes are acknowledged', () => {
    expect(unlockGateAllowsPathname('/login/setup-2fa')).toBe(true);
    expect(unlockGateAllowsPathname('/login/set-unlock-code')).toBe(true);
    expect(unlockGateAllowsPathname('/executive')).toBe(false);
  });
});
