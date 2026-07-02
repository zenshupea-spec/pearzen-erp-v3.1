/** Public marketing site for Pearzen — pearzen.tech / www.pearzen.tech */

export const DEFAULT_PEARZEN_WEBSITE_DOMAIN = 'pearzen.tech';

export const PEARZEN_WEBSITE_PUBLIC_URL = `https://www.${DEFAULT_PEARZEN_WEBSITE_DOMAIN}`;

export function pearzenWebsiteHosts(): string[] {
  const configured = process.env.NEXT_PUBLIC_PEARZEN_WEBSITE_HOST?.trim().toLowerCase();
  const hosts = new Set<string>([
    DEFAULT_PEARZEN_WEBSITE_DOMAIN,
    `www.${DEFAULT_PEARZEN_WEBSITE_DOMAIN}`,
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

export function isPearzenWebsiteHost(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase();
  return pearzenWebsiteHosts().includes(host);
}

export function isPearzenWebsitePath(pathname: string): boolean {
  return (
    pathname === '/pearzen-website' || pathname.startsWith('/pearzen-website/')
  );
}

export function isPearzenWebsitePublicPath(pathname: string): boolean {
  return isPearzenWebsitePath(pathname);
}
