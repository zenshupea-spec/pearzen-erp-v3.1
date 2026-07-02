/** Pure helpers for Pears listing consent — safe in tests + client bundles. */

export type SuperappListingConsent = {
  companyId: string;
  consentedAt: string | null;
  listProducts: boolean;
  listBooking: boolean;
  consentedByEmail: string | null;
  updatedAt: string;
};

export function isSuperappListingActive(consent: SuperappListingConsent | null): boolean {
  return Boolean(consent?.consentedAt && (consent.listProducts || consent.listBooking));
}

export function superappExportErrorStatus(message: string): number {
  if (message.includes('not found')) return 404;
  if (message.includes('consent')) return 403;
  return 500;
}
