import { tenantBaseDomain } from './tenant-host';
import { normalizeHostname } from './forge-host';

export const PEARS_APP_FUTURE_HOST =
  process.env.NEXT_PUBLIC_PEARS_APP_HOST ?? `pear.${tenantBaseDomain()}`;

export function pearsHost(): string {
  return process.env.NEXT_PUBLIC_PEARS_PROFILE_HOST ?? PEARS_APP_FUTURE_HOST;
}

export function isDedicatedPearsHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  const canonical = pearsHost().toLowerCase();
  return host === canonical;
}

export function isPearsRoute(pathname: string): boolean {
  return (
    pathname === '/pears' ||
    pathname.startsWith('/pears/') ||
    pathname === '/login/pears'
  );
}

export function pearsLoginUrl(origin?: string): string {
  if (origin) return `${origin.replace(/\/$/, '')}/login/pears`;
  return `https://${pearsHost()}/login/pears`;
}

export function pearsProfileUrl(origin?: string): string {
  if (origin) return `${origin.replace(/\/$/, '')}/pears/profile`;
  return `https://${pearsHost()}/pears/profile`;
}
