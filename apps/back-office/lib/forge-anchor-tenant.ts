import { CVS_COMPANY_ID } from './company-ids';

export type ForgeAnchorTenant = {
  id: string;
  name: string;
  slug: string | null;
};

/** Resolve anchor id from forge_settings row (null column → CVS migration default). */
export function resolveForgeAnchorTenantIdFromSettings(
  anchorTenantId: string | null | undefined,
): string {
  if (typeof anchorTenantId === 'string' && anchorTenantId.length > 0) {
    return anchorTenantId;
  }
  return CVS_COMPANY_ID;
}

export function isValidForgeAnchorCompanyId(companyId: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(companyId.trim());
}
