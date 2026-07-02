import { describe, expect, it } from 'vitest';

import {
  HEAD_OFFICE_PASSWORD_CHANGE_PATH,
  headOfficePortalGateRedirectPath,
  isHeadOfficePasswordChangePath,
} from './head-office-portal-gate-paths';

describe('head office password rotation gate paths', () => {
  it('routes expired-password gate to change-password page', () => {
    expect(headOfficePortalGateRedirectPath('change_password')).toBe(
      HEAD_OFFICE_PASSWORD_CHANGE_PATH,
    );
    expect(isHeadOfficePasswordChangePath('/account/change-password')).toBe(true);
    expect(isHeadOfficePasswordChangePath('/om')).toBe(false);
  });
});
