import {
  isLocalDevHost,
  tenantBaseDomain,
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

  const devSlug = process.env.NEXT_PUBLIC_DEV_TENANT_SLUG?.trim();
  const base = tenantBaseDomain();

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_BACK_OFFICE_URL must be set in production for Shalom OTA iCal links.',
    );
  }

  if (!devSlug) {
    return `http://127.0.0.1:${process.env.PORT ?? process.env.BACK_OFFICE_PORT ?? '3002'}`;
  }

  return `https://${devSlug}.${base}`;
}

/** Public iCal export URL for a Shalom property (paste into Airbnb calendar import). */
export function buildShalomIcalExportUrl(propertyId: string): string {
  return `${publicOtaBackOfficeOrigin()}/api/ical/export/${propertyId}.ics`;
}
