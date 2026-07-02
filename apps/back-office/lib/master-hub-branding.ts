import { CVS_TENANT_SLUG } from './company-ids';

export type MasterHubBranding = {
  hubSubtitle: string;
  hubTitle: string;
  brandLabel: string;
};

const PEARZEN_PLATFORM_BRANDING: MasterHubBranding = {
  hubSubtitle: 'Pearzen Technologies',
  hubTitle: 'PEARZEN HQ — MASTER HUB',
  brandLabel: 'PEARZEN TECH — INTERNAL SYSTEMS',
};

const CVS_FALLBACK_LEGAL_NAME = 'Classic Venture Security (Pvt) Ltd.';

function isClassicVentureTenant(tenantSlug: string | null | undefined): boolean {
  const slug = (tenantSlug ?? '').trim().toLowerCase();
  return slug === CVS_TENANT_SLUG;
}

/** HQ Master Hub header copy — tenant-aware (CVS vs Pearzen platform default). */
export function resolveMasterHubBranding(input: {
  tenantName?: string | null;
  tenantSlug?: string | null;
}): MasterHubBranding {
  if (!isClassicVentureTenant(input.tenantSlug)) {
    return PEARZEN_PLATFORM_BRANDING;
  }

  const legalName = (input.tenantName ?? '').trim() || CVS_FALLBACK_LEGAL_NAME;

  return {
    hubSubtitle: legalName,
    hubTitle: 'CLASSIC VENTURE — MASTER HUB',
    brandLabel: 'CVS INTERNAL SYSTEMS',
  };
}
