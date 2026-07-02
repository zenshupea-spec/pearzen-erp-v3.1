import { describe, expect, it } from 'vitest';

import { CVS_COMPANY_ID, CVS_TENANT_SLUG } from './company-ids';
import {
  assertForgeTenantCreated,
  assertForgeTenantInsertPayload,
  assertForgeTenantSlugAllowed,
  assertNotCvsCompanyMutation,
  ForgeTenantProvisionGuardError,
} from './forge-tenant-provision-guard';

describe('forge tenant provision guards (S-31)', () => {
  it('blocks reserved CVS slug', () => {
    expect(() => assertForgeTenantSlugAllowed(CVS_TENANT_SLUG)).toThrow(
      ForgeTenantProvisionGuardError,
    );
  });

  it('blocks insert payload reusing CVS company id', () => {
    expect(() =>
      assertForgeTenantInsertPayload({ id: CVS_COMPANY_ID, slug: 'acme-demo' }),
    ).toThrow(ForgeTenantProvisionGuardError);
  });

  it('blocks update/delete/reuse against CVS company id', () => {
    expect(() => assertNotCvsCompanyMutation(CVS_COMPANY_ID, 'update')).toThrow(
      ForgeTenantProvisionGuardError,
    );
  });

  it('allows new demo slug and rejects CVS id on created row', () => {
    const demoId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(() => assertForgeTenantCreated(demoId, 'acme-demo')).not.toThrow();
    expect(() => assertForgeTenantCreated(CVS_COMPANY_ID, 'acme-demo')).toThrow();
  });
});
