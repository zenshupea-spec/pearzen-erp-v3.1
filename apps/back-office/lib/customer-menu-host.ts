/** Public café menu domain — must stay on a separate deploy from back-office (pearzen.com). */

export const DEFAULT_CUSTOMER_MENU_URL = 'https://tasha.lk';

export const CUSTOMER_MENU_CLOUDFLARE_LINKS = {
  dashboard: 'https://dash.cloudflare.com/',
  addSite: 'https://developers.cloudflare.com/fundamentals/setup/manage-domains/add-site/',
  dnsRecords: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
  vercelWithCloudflare: 'https://vercel.com/docs/projects/domains/working-with-domains/cloudflare',
  sslFullStrict: 'https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/',
  waf: 'https://developers.cloudflare.com/waf/',
  rateLimiting: 'https://developers.cloudflare.com/waf/rate-limiting-rules/',
} as const;

export const CUSTOMER_MENU_VERCEL_LINKS = {
  addDomain: 'https://vercel.com/docs/projects/domains/working-with-domains/add-a-domain',
  clientPwaDeploy: 'https://vercel.com/new',
} as const;

export function normalizeCustomerMenuUrl(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_CUSTOMER_MENU_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/$/, '');
  return `https://${trimmed.replace(/\/$/, '')}`;
}

export function customerMenuHost(url: string | null | undefined): string {
  try {
    return new URL(normalizeCustomerMenuUrl(url)).host;
  } catch {
    return url?.trim() || DEFAULT_CUSTOMER_MENU_URL.replace(/^https?:\/\//, '');
  }
}

/** Hostnames that must never serve back-office ERP routes. */
export function isPublicCustomerMenuHost(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase();
  const configured = process.env.NEXT_PUBLIC_CUSTOMER_MENU_HOST?.trim().toLowerCase();
  if (configured && host === configured.replace(/^https?:\/\//, '').split('/')[0]) {
    return true;
  }
  return host === 'tasha.lk' || host === 'www.tasha.lk';
}

export const CUSTOMER_MENU_SECURITY_RULES = [
  'Point tasha.lk at the public menu app only — never at back-office (pearzen.com / executive login).',
  'Use a separate Vercel project for the customer menu (client-pwa), not the ERP deploy.',
  'Public reads go through get_cafe_public_menu() — no recipe costs, margins, or staff data.',
  'Enable Cloudflare proxy (orange cloud), SSL Full (strict), WAF, and rate limits on order APIs.',
] as const;
