import { describe, expect, it } from 'vitest';

import {
  executiveMissingRecoveryEmail,
  hasExecutiveRecoveryEmailOnRecord,
  maskRecoveryEmail,
  validateExecutiveRecoveryEmail,
  validateExecutiveWorkEmailChange,
} from './head-office-portal-recovery-email';

describe('head-office-portal-recovery-email', () => {
  it('requires recovery distinct from work email', () => {
    expect(
      validateExecutiveRecoveryEmail('md@company.com', 'personal@gmail.com'),
    ).toEqual({ ok: true, recoveryEmail: 'personal@gmail.com' });

    expect(validateExecutiveRecoveryEmail('md@company.com', 'md@company.com').ok).toBe(
      false,
    );
    expect(validateExecutiveRecoveryEmail('md@company.com', '').ok).toBe(false);
    expect(validateExecutiveRecoveryEmail('md@company.com', 'not-an-email').ok).toBe(
      false,
    );
  });

  it('detects recovery email on auth record', () => {
    expect(hasExecutiveRecoveryEmailOnRecord({ recovery_email: 'a@b.com' })).toBe(true);
    expect(hasExecutiveRecoveryEmailOnRecord({ recovery_email: null })).toBe(false);
  });

  it('masks recovery email for roster display', () => {
    expect(maskRecoveryEmail('personal@gmail.com')).toBe('p••••l@gmail.com');
    expect(maskRecoveryEmail(null)).toBe('Not set');
  });
});

describe('validateExecutiveWorkEmailChange', () => {
  it('accepts a new work email that differs from recovery', () => {
    expect(
      validateExecutiveWorkEmailChange({
        currentWorkEmail: 'md@company.com',
        recoveryEmail: 'personal@gmail.com',
        newWorkEmail: 'md.new@company.com',
      }),
    ).toEqual({ ok: true, workEmail: 'md.new@company.com' });
  });

  it('rejects when new work email matches recovery', () => {
    expect(
      validateExecutiveWorkEmailChange({
        currentWorkEmail: 'md@company.com',
        recoveryEmail: 'personal@gmail.com',
        newWorkEmail: 'personal@gmail.com',
      }).ok,
    ).toBe(false);
  });

  it('treats valid draft as missing until saved on record', () => {
    expect(
      executiveMissingRecoveryEmail('MD', 'personal@gmail.com'),
    ).toBe(false);
    expect(executiveMissingRecoveryEmail('MD', null)).toBe(true);
    expect(executiveMissingRecoveryEmail('MD', 'not-an-email')).toBe(true);
  });
});
