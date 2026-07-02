import { CVS_COMPANY_ID, CVS_TENANT_SLUG } from './company-ids';

const RESERVED_TENANT_SLUGS = new Set([CVS_TENANT_SLUG, 'classic-venture']);

export class ForgeTenantProvisionGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForgeTenantProvisionGuardError';
  }
}

/** Slugs reserved for production anchor tenants — never provision a new row on these. */
export function assertForgeTenantSlugAllowed(slug: string): void {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    throw new ForgeTenantProvisionGuardError('Tenant slug is required.');
  }
  if (RESERVED_TENANT_SLUGS.has(normalized)) {
    throw new ForgeTenantProvisionGuardError(
      `Slug "${normalized}" is reserved for an existing production tenant.`,
    );
  }
}

/** Block any mutation targeting the CVS anchor company row. */
export function assertNotCvsCompanyMutation(
  companyId: string,
  operation: 'update' | 'delete' | 'reuse',
): void {
  if (companyId === CVS_COMPANY_ID) {
    throw new ForgeTenantProvisionGuardError(
      `Cannot ${operation} the CVS anchor company (${CVS_COMPANY_ID}).`,
    );
  }
}

/**
 * Inserts must allocate a fresh UUID — never reuse or overwrite the CVS company id.
 */
export function assertForgeTenantInsertPayload(
  payload: { id?: string | null; slug?: string | null },
): void {
  if (payload.id) {
    assertNotCvsCompanyMutation(payload.id, 'reuse');
  }
  if (payload.slug) {
    assertForgeTenantSlugAllowed(payload.slug);
  }
}

export function assertForgeTenantCreated(companyId: string, slug: string): void {
  assertNotCvsCompanyMutation(companyId, 'reuse');
  assertForgeTenantSlugAllowed(slug);
  if (companyId === CVS_COMPANY_ID) {
    throw new ForgeTenantProvisionGuardError('Provisioned company id matches CVS anchor.');
  }
}

export { CVS_COMPANY_ID, CVS_TENANT_SLUG };
