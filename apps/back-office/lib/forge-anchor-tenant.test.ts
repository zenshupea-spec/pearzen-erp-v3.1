import { describe, expect, it } from 'vitest';

import { CVS_COMPANY_ID } from './company-ids';
import { resolveForgeAnchorTenantIdFromSettings } from './forge-anchor-tenant';

describe('resolveForgeAnchorTenantIdFromSettings', () => {
  it('returns anchor_tenant_id when set', () => {
    const demoId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(resolveForgeAnchorTenantIdFromSettings(demoId)).toBe(demoId);
  });

  it('falls back to CVS when anchor column is null', () => {
    expect(resolveForgeAnchorTenantIdFromSettings(null)).toBe(CVS_COMPANY_ID);
    expect(resolveForgeAnchorTenantIdFromSettings(undefined)).toBe(CVS_COMPANY_ID);
    expect(resolveForgeAnchorTenantIdFromSettings('')).toBe(CVS_COMPANY_ID);
  });
});
