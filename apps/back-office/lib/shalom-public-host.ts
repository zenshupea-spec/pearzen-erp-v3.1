/** Public customer site for Shalom Residence — shalom.pearzen.tech (bookings; policies for PayHere). */

import { ECOMMERCE_POLICY_PATHS } from '../../../packages/ecommerce-policies/policy-paths';

export const DEFAULT_SHALOM_PUBLIC_DOMAIN = 'shalom.pearzen.tech';

export const SHALOM_PUBLIC_URL = `https://${DEFAULT_SHALOM_PUBLIC_DOMAIN}`;

export function shalomPublicHosts(): string[] {
  const configured = process.env.NEXT_PUBLIC_SHALOM_PUBLIC_HOST?.trim().toLowerCase();
  const hosts = new Set<string>([
    DEFAULT_SHALOM_PUBLIC_DOMAIN,
    `www.${DEFAULT_SHALOM_PUBLIC_DOMAIN}`,
  ]);
  if (configured) {
    const bare = configured.replace(/^https?:\/\//, '').split('/')[0];
    hosts.add(bare);
    if (!bare.startsWith('www.')) {
      hosts.add(`www.${bare}`);
    }
  }
  return [...hosts];
}

export function isShalomPublicHost(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase();
  return shalomPublicHosts().includes(host);
}

export const SHALOM_PUBLIC_POLICY_PATHS = [
  ECOMMERCE_POLICY_PATHS.refund,
  ECOMMERCE_POLICY_PATHS.privacy,
  ECOMMERCE_POLICY_PATHS.terms,
] as const;

export function isShalomPublicPolicyPath(pathname: string): boolean {
  return (SHALOM_PUBLIC_POLICY_PATHS as readonly string[]).includes(pathname);
}

export function isShalomPublicInternalPath(pathname: string): boolean {
  return (
    pathname === '/shalom-public' ||
    pathname.startsWith('/shalom-public/') ||
    isShalomPublicPolicyPath(pathname)
  );
}

/** Map clean public URLs to internal app routes. */
export function shalomPublicInternalPath(pathname: string): string | null {
  if (isShalomPublicPolicyPath(pathname)) {
    return `/shalom-public${pathname}`;
  }
  if (pathname === '/' || pathname === '/shalom-public') {
    return '/shalom-public';
  }
  return null;
}
