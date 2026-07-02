import { describe, expect, it } from 'vitest';

import {
  executivePortalGateError,
  headOfficePortalGateRedirectPath,
} from './head-office-portal-gate-paths';

describe('headOfficePortalGateRedirectPath', () => {
  it('maps 2FA gates to login routes', () => {
    expect(headOfficePortalGateRedirectPath('setup_2fa')).toBe('/login/setup-2fa');
    expect(headOfficePortalGateRedirectPath('verify_2fa')).toBe('/login/verify-2fa');
  });

  it('returns null for ok and provision states', () => {
    expect(headOfficePortalGateRedirectPath('ok')).toBeNull();
    expect(headOfficePortalGateRedirectPath('not_provisioned')).toBeNull();
  });
});

describe('executivePortalGateError', () => {
  it('describes missing 2FA enrollment and step-up', () => {
    expect(executivePortalGateError('setup_2fa')).toMatch(/two-factor/i);
    expect(executivePortalGateError('verify_2fa')).toMatch(/authenticator/i);
  });
});
