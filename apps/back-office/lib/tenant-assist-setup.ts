/** Partner-assisted tenant setup — domains and PayHere credential metadata. */

export const TENANT_CUSTOM_DOMAIN_TYPES = [
  'erp_staff',
  'public_website',
  'customer_menu',
  'security_website',
] as const;

export type TenantCustomDomainType = (typeof TENANT_CUSTOM_DOMAIN_TYPES)[number];

export const TENANT_DOMAIN_SSL_STATUSES = ['pending', 'active', 'error'] as const;

export type TenantDomainSslStatus = (typeof TENANT_DOMAIN_SSL_STATUSES)[number];

export type TenantCustomDomainRow = {
  id: string;
  companyId: string;
  hostname: string;
  domainType: TenantCustomDomainType;
  verifiedAt: string | null;
  sslStatus: TenantDomainSslStatus;
  createdAt: string;
};

export type PartnerAssistGrant = {
  id: string;
  partnerId: string;
  companyId: string;
  domainSetup: boolean;
  payhereSetup: boolean;
  grantedBy: string | null;
  expiresAt: string | null;
};

export type TenantPayhereCredentialStatus = {
  configured: boolean;
  merchantIdMasked: string | null;
  sandbox: boolean;
  configuredAt: string | null;
};

export function isTenantCustomDomainType(value: string): value is TenantCustomDomainType {
  return (TENANT_CUSTOM_DOMAIN_TYPES as readonly string[]).includes(value);
}

export function tenantCustomDomainTypeLabel(domainType: TenantCustomDomainType): string {
  switch (domainType) {
    case 'erp_staff':
      return 'ERP staff portal';
    case 'public_website':
      return 'Public marketing site';
    case 'customer_menu':
      return 'Customer menu PWA';
    case 'security_website':
      return 'Security marketing site';
    default:
      return domainType;
  }
}

export function tenantDomainSslStatusLabel(status: TenantDomainSslStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending verification';
    case 'active':
      return 'Active';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}

export function normalizeCustomDomainHostname(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export function isValidCustomDomainHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253) return false;
  if (!hostname.includes('.')) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(hostname);
}

export function maskMerchantId(merchantId: string): string {
  const trimmed = merchantId.trim();
  if (trimmed.length <= 6) return '••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-2)}`;
}

export function assistGrantIsActive(
  grant: Pick<PartnerAssistGrant, 'expiresAt'> | null | undefined,
): boolean {
  if (!grant?.expiresAt) return true;
  return new Date(grant.expiresAt).getTime() > Date.now();
}

export function assistGrantAllowsDomainSetup(
  grant: Pick<PartnerAssistGrant, 'domainSetup' | 'expiresAt'> | null | undefined,
): boolean {
  return Boolean(grant?.domainSetup && assistGrantIsActive(grant));
}

export function assistGrantAllowsPayhereSetup(
  grant: Pick<PartnerAssistGrant, 'payhereSetup' | 'expiresAt'> | null | undefined,
): boolean {
  return Boolean(grant?.payhereSetup && assistGrantIsActive(grant));
}
