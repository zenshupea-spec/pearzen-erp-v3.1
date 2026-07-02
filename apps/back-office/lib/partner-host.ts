import { tenantBaseDomain } from './tenant-host';
import { normalizeHostname } from './forge-host';

export function partnerHost(): string {
  return process.env.NEXT_PUBLIC_PARTNER_HOST ?? `partners.${tenantBaseDomain()}`;
}

export function isDedicatedPartnerHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  const canonical = partnerHost().toLowerCase();
  return host === canonical;
}

export function isPartnerRoute(pathname: string): boolean {
  return (
    pathname === '/partners' ||
    pathname.startsWith('/partners/') ||
    pathname === '/login/partners'
  );
}

export function partnerLoginUrl(origin?: string): string {
  if (origin) return `${origin.replace(/\/$/, '')}/login/partners`;
  return `https://${partnerHost()}/login/partners`;
}
