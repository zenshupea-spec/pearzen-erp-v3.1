/** Public marketing site for Classic Venture Security — classicventure.com */

export const DEFAULT_SECURITY_WEBSITE_DOMAIN = 'classicventure.com';

export const SECURITY_WEBSITE_PUBLIC_URL = `https://${DEFAULT_SECURITY_WEBSITE_DOMAIN}`;

export function securityWebsiteHosts(): string[] {
  const configured = process.env.NEXT_PUBLIC_SECURITY_WEBSITE_HOST?.trim().toLowerCase();
  const hosts = new Set<string>([
    DEFAULT_SECURITY_WEBSITE_DOMAIN,
    `www.${DEFAULT_SECURITY_WEBSITE_DOMAIN}`,
    'classicventuresecurity.com',
    'www.classicventuresecurity.com',
  ]);
  if (configured) {
    hosts.add(configured.replace(/^https?:\/\//, '').split('/')[0]);
    if (!configured.startsWith('www.')) {
      hosts.add(`www.${configured.replace(/^https?:\/\//, '').split('/')[0]}`);
    }
  }
  return [...hosts];
}

export function isSecurityWebsiteHost(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase();
  return securityWebsiteHosts().includes(host);
}

export function isSecurityWebsitePath(pathname: string): boolean {
  return (
    pathname === '/security-website' ||
    pathname.startsWith('/security-website/') ||
    pathname.startsWith('/security-brochure/')
  );
}

/** Client portal sign-in — the only non-marketing ERP route on classicventuresecurity.com */
export function isClientLoginPath(pathname: string): boolean {
  return pathname === '/clientlogin' || pathname.startsWith('/clientlogin/');
}

export function isSecurityWebsitePublicPath(pathname: string): boolean {
  return isSecurityWebsitePath(pathname) || isClientLoginPath(pathname);
}
