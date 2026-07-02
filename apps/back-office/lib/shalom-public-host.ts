/** Public customer site for Shalom Residence — shalom.pearzen.tech (bookings; policies for PayHere). */

import { ECOMMERCE_POLICY_PATHS } from '../../../packages/ecommerce-policies/policy-paths';

export const DEFAULT_SHALOM_PUBLIC_DOMAIN = 'shalom.pearzen.tech';

export const SHALOM_PUBLIC_URL = `https://${DEFAULT_SHALOM_PUBLIC_DOMAIN}`;

/** Property slug segment in public URLs — mirrors publish slug rules. */
const SHALOM_PUBLIC_SLUG_SEGMENT = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;

/** Booking id segment on confirmation pages. */
const SHALOM_PUBLIC_BOOKING_ID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeShalomPublicPathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.replace(/\/+$/, '') || '/';
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment).trim().toLowerCase();
  } catch {
    return '';
  }
}

function isSafePropertySlugSegment(segment: string): boolean {
  const decoded = decodePathSegment(segment);
  return Boolean(decoded && SHALOM_PUBLIC_SLUG_SEGMENT.test(decoded));
}

function isSafeBookingIdSegment(segment: string): boolean {
  const decoded = decodePathSegment(segment);
  return Boolean(decoded && SHALOM_PUBLIC_BOOKING_ID_SEGMENT.test(decoded));
}

function isShalomPublicAppInternalPrefix(pathname: string): boolean {
  return pathname === '/shalom-public' || pathname.startsWith('/shalom-public/');
}

export function isShalomPublicInternalPath(pathname: string): boolean {
  return shalomPublicInternalPath(pathname) != null;
}

/** Map clean public URLs on shalom.pearzen.tech to internal app routes under /shalom-public. */
export function shalomPublicInternalPath(pathname: string): string | null {
  const normalized = normalizeShalomPublicPathname(pathname);

  if (isShalomPublicPolicyPath(normalized)) {
    return `/shalom-public${normalized}`;
  }

  if (normalized === '/' || normalized === '/shalom-public') {
    return '/shalom-public';
  }

  if (isShalomPublicAppInternalPrefix(normalized)) {
    return normalized;
  }

  if (normalized === '/properties') {
    return '/shalom-public/properties';
  }

  if (normalized === '/contact') {
    return '/shalom-public/contact';
  }

  const propertyDetailMatch = /^\/properties\/([^/]+)$/.exec(normalized);
  if (propertyDetailMatch && isSafePropertySlugSegment(propertyDetailMatch[1])) {
    const slug = decodePathSegment(propertyDetailMatch[1]);
    return `/shalom-public/properties/${slug}`;
  }

  const bookMatch = /^\/book\/([^/]+)$/.exec(normalized);
  if (bookMatch && isSafePropertySlugSegment(bookMatch[1])) {
    const slug = decodePathSegment(bookMatch[1]);
    return `/shalom-public/book/${slug}`;
  }

  const confirmationMatch = /^\/confirmation\/([^/]+)$/.exec(normalized);
  if (confirmationMatch && isSafeBookingIdSegment(confirmationMatch[1])) {
    const bookingId = decodePathSegment(confirmationMatch[1]);
    return `/shalom-public/confirmation/${bookingId}`;
  }

  return null;
}
