/**
 * Guest-facing paths for shalom.pearzen.tech.
 * Clean URLs (`/properties`) rewrite via middleware on the public host.
 * On local unified dev the app lives under `/shalom-public`.
 */

export const SHALOM_PUBLIC_APP_MOUNT = '/shalom-public';

export function resolveShalomPublicAppPrefix(pathname?: string | null): string {
  if (pathname === SHALOM_PUBLIC_APP_MOUNT || pathname?.startsWith(`${SHALOM_PUBLIC_APP_MOUNT}/`)) {
    return SHALOM_PUBLIC_APP_MOUNT;
  }

  if (pathname && pathname !== SHALOM_PUBLIC_APP_MOUNT) {
    return '';
  }

  const configured = process.env.NEXT_PUBLIC_SHALOM_PUBLIC_APP_PREFIX;
  if (configured !== undefined) {
    return configured.replace(/\/$/, '');
  }

  if (process.env.NODE_ENV !== 'production') {
    return SHALOM_PUBLIC_APP_MOUNT;
  }

  return '';
}

export function shalomPublicHref(path = '/', pathname?: string | null): string {
  const prefix = resolveShalomPublicAppPrefix(pathname);

  if (!path || path === '/') {
    return prefix || '/';
  }

  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (prefix && (normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return normalized;
  }

  return prefix ? `${prefix}${normalized}` : normalized;
}

export type ShalomPublicNavItem = {
  href: string;
  label: string;
};

export function buildShalomPublicNavItems(
  listings: Array<{ slug: string; name: string; headline: string }>,
  pathname?: string | null,
): ShalomPublicNavItem[] {
  const items: ShalomPublicNavItem[] = [{ href: shalomPublicHref('/', pathname), label: 'Home' }];

  if (listings.length > 0) {
    for (const listing of listings) {
      const label = listing.headline.trim() || listing.name.trim() || 'Property';
      items.push({
        href: shalomPublicHref(`/properties/${listing.slug}`, pathname),
        label,
      });
    }
  } else {
    items.push({ href: shalomPublicHref('/properties', pathname), label: 'Properties' });
  }

  items.push({ href: shalomPublicHref('/contact', pathname), label: 'Contact' });

  return items;
}
