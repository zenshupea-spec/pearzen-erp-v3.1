import { describe, expect, it } from 'vitest';

import {
  canAccessHqAuditRoute,
  canFetchAuditLedgerTab,
  portalKeysForTab,
} from './audit-portals';

describe('audit ledger access', () => {
  it('allows governance roles on /hq/audit', () => {
    expect(canAccessHqAuditRoute({ role: 'MD' })).toBe(true);
    expect(canAccessHqAuditRoute({ role: 'FM' })).toBe(true);
  });

  it('allows rbacGated staff when audit_ledger is READ or FULL', () => {
    expect(
      canAccessHqAuditRoute({
        role: 'STAFF',
        rbacGated: true,
        portalRbac: { audit_ledger: 'READ' },
      }),
    ).toBe(true);
    expect(
      canAccessHqAuditRoute({
        role: 'STAFF',
        rbacGated: true,
        portalRbac: { audit_ledger: 'NONE' },
      }),
    ).toBe(false);
  });

  it('restricts md-od and security tabs to MD/OD only', () => {
    expect(canFetchAuditLedgerTab('md-od', { role: 'MD' })).toBe(true);
    expect(canFetchAuditLedgerTab('security', { role: 'OD' })).toBe(true);
    expect(canFetchAuditLedgerTab('md-od', { role: 'FM' })).toBe(false);
    expect(canFetchAuditLedgerTab('security', { role: 'EA' })).toBe(false);
  });

  it('denies OM/HR/TM staff tabs without ledger clearance', () => {
    expect(canFetchAuditLedgerTab('om', { role: 'OM' })).toBe(false);
    expect(canFetchAuditLedgerTab('hq-staff', { role: 'HR' })).toBe(false);
    expect(canFetchAuditLedgerTab('tm', { role: 'TM' })).toBe(false);
  });

  it('maps shalom-front ledger tab to audit_logs portal key', () => {
    expect(portalKeysForTab('shalom-front')).toEqual(['shalom-front']);
    expect(canFetchAuditLedgerTab('shalom-front', { role: 'MD' })).toBe(true);
    expect(canFetchAuditLedgerTab('shalom-front', { role: 'FM' })).toBe(true);
  });
});
