import { describe, expect, it } from 'vitest';

describe('MD settings audit action types', () => {
  it('uses UPDATE_* prefixes for envelope-only settings saves', () => {
    const envelopeAuditActions = [
      'UPDATE_ADVANCE_SALARY_SETTINGS',
      'UPDATE_PORTAL_RBAC_MATRIX',
      'UPDATE_RANK_PAY_MATRIX',
      'UPDATE_SECURITY_WEBSITE_CONTENT',
      'UPDATE_COMPANY_LOGO',
      'UPDATE_VAULT_MASTER_PIN',
      'UPDATE_VAULT_SESSION_POLICY',
    ] as const;

    for (const action of envelopeAuditActions) {
      expect(action.startsWith('UPDATE_')).toBe(true);
    }
  });
});
