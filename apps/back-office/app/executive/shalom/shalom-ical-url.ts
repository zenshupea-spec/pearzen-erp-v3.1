import { CVS_TENANT_SLUG } from '../../../lib/company-ids';
import {
  isLocalDevHost,
  tenantBaseDomain,
  tenantSubdomainsLive,
} from '../../../lib/tenant-host';

/** HTTPS origin Airbnb / Booking.com can fetch — never localhost. */
export function publicOtaBackOfficeOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_BACK_OFFICE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    try {
      const { hostname, protocol } = new URL(window.location.origin);
      if (!isLocalDevHost(hostname) && protocol === 'https:') {
        return window.location.origin.replace(/\/$/, '');
      }
    } catch {
      /* fall through */
    }
  }

  const slug = process.env.NEXT_PUBLIC_DEV_TENANT_SLUG?.trim() || CVS_TENANT_SLUG;
  const base = tenantBaseDomain();

  if (process.env.NODE_ENV === 'production') {
    return tenantSubdomainsLive()
      ? `https://${slug}.${base}`
      : `https://${base}`;
  }

  // Local dev: copy link targets live Vercel host so OTAs can import the feed
  return `https://${slug}.${base}`;
}

/** Public iCal export URL for a Shalom property (paste into Airbnb calendar import). */
export function buildShalomIcalExportUrl(propertyId: string): string {
  return `${publicOtaBackOfficeOrigin()}/api/ical/export/${propertyId}.ics`;
}
