import { describe, expect, it } from 'vitest';

import {
  canExecutiveResetTargetTwoFactor,
} from './executive-portal-auth-policy';
import {
  HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT,
  HEAD_OFFICE_NO_BACKUP_CODES_ERROR,
  HEAD_OFFICE_RECOVER_2FA_REQUIRES_BACKUP_USE_ERROR,
  HO_PORTAL_BACKUP_CODE_COUNT,
  isHeadOfficeBackupCodeInput,
} from './head-office-totp-backup-client';

describe('head-office 2FA recovery copy', () => {
  it('escalates to Pearzen SaaS Forge when backup codes are exhausted', () => {
    expect(HEAD_OFFICE_NO_BACKUP_CODES_ERROR).toMatch(/Pearzen SaaS Forge/i);
    expect(HEAD_OFFICE_RECOVER_2FA_REQUIRES_BACKUP_USE_ERROR).toMatch(
      /Pearzen SaaS Forge/i,
    );
    expect(HEAD_OFFICE_FORGE_2FA_ESCALATION_HINT).toMatch(/Pearzen SaaS Forge/i);
  });

  it('issues five backup codes at enrollment', () => {
    expect(HO_PORTAL_BACKUP_CODE_COUNT).toBe(5);
  });
});

describe('isHeadOfficeBackupCodeInput', () => {
  it('accepts formatted backup codes and rejects 6-digit TOTP', () => {
    expect(isHeadOfficeBackupCodeInput('ABCD-2345')).toBe(true);
    expect(isHeadOfficeBackupCodeInput('482910')).toBe(false);
  });
});

describe('canExecutiveResetTargetTwoFactor', () => {
  it('lets MD reset any rank including OD', () => {
    expect(canExecutiveResetTargetTwoFactor('MD', 'OD')).toBe(true);
    expect(canExecutiveResetTargetTwoFactor('MD', 'HR')).toBe(true);
  });

  it('blocks OD from resetting MD 2FA', () => {
    expect(canExecutiveResetTargetTwoFactor('OD', 'MD')).toBe(false);
    expect(canExecutiveResetTargetTwoFactor('OD', 'HR')).toBe(true);
  });
});
