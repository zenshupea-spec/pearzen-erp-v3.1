import {
  formatPayHereAmount,
  payHereCheckoutHash,
  type PayHereCheckoutFields,
} from '../../../packages/cafe-customer-order/payhere';
import type { ResolvedPayHereCredentials } from '../../../packages/cafe-customer-order/tenant-payhere-server';

import { shalomPublicHref } from './shalom-public-path';
import {
  resolveShalomPayHereNotifyBaseUrl,
  resolveShalomPublicSiteBaseUrl,
} from './shalom-public-site-url';

export {
  resolveShalomPayHereNotifyBaseUrl,
  resolveShalomPublicSiteBaseUrl,
} from './shalom-public-site-url';

export type ShalomPayHereBookingRecord = {
  id: string;
  companyId: string;
  propertyId: string;
  propertySlug: string;
  propertyName: string;
  propertyLocation: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalRevenueLkr: number;
  bookingStatus: string;
  channel: string;
  paid: boolean;
  pendingPaymentExpiresAt: string | null;
};

export function splitShalomGuestName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Guest', last: 'Shalom' };
  if (parts.length === 1) return { first: parts[0], last: 'Guest' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export function buildShalomPayHereReturnUrl(bookingId: string): string {
  const base = resolveShalomPublicSiteBaseUrl();
  const path = shalomPublicHref(`/confirmation/${bookingId}?status=return`);
  if (base.endsWith('/shalom-public') && path.startsWith('/')) {
    return `${base}${path}`;
  }
  return `${base}${path}`;
}

export function buildShalomPayHereCancelUrl(booking: ShalomPayHereBookingRecord): string {
  const base = resolveShalomPublicSiteBaseUrl();
  const params = new URLSearchParams({
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    payment: 'cancelled',
  });
  const path = shalomPublicHref(`/book/${booking.propertySlug}?${params.toString()}`);
  if (base.endsWith('/shalom-public') && path.startsWith('/')) {
    return `${base}${path}`;
  }
  return `${base}${path}`;
}

export function buildShalomPayHereNotifyUrl(): string {
  return `${resolveShalomPayHereNotifyBaseUrl()}/api/shalom-public/payhere-notify`;
}

export function isShalomBookingAwaitingPayment(
  booking: Pick<
    ShalomPayHereBookingRecord,
    'bookingStatus' | 'channel' | 'paid' | 'pendingPaymentExpiresAt'
  >,
  now = new Date(),
): boolean {
  if (booking.channel !== 'DIRECT') return false;
  if (booking.paid) return false;
  if (booking.bookingStatus !== 'PENDING_PAYMENT') return false;

  const expiresAt = booking.pendingPaymentExpiresAt?.trim();
  if (!expiresAt) return true;

  const expiresMs = Date.parse(expiresAt);
  return Number.isFinite(expiresMs) && expiresMs > now.getTime();
}

export function buildShalomPayHereCheckoutFields(input: {
  booking: ShalomPayHereBookingRecord;
  credentials: ResolvedPayHereCredentials;
}): PayHereCheckoutFields {
  const amount = formatPayHereAmount(input.booking.totalRevenueLkr);
  const currency = 'LKR';
  const { first, last } = splitShalomGuestName(input.booking.guestName);
  const items = `${input.booking.propertyName} · ${input.booking.nights} ${
    input.booking.nights === 1 ? 'night' : 'nights'
  }`;

  return {
    merchant_id: input.credentials.merchantId,
    return_url: buildShalomPayHereReturnUrl(input.booking.id),
    cancel_url: buildShalomPayHereCancelUrl(input.booking),
    notify_url: buildShalomPayHereNotifyUrl(),
    order_id: input.booking.id,
    items: items.slice(0, 250),
    currency,
    amount,
    first_name: first.slice(0, 50),
    last_name: last.slice(0, 50),
    email: input.booking.guestEmail.slice(0, 100),
    phone: input.booking.guestPhone.slice(0, 20),
    address: (input.booking.propertyLocation || 'Colombo').slice(0, 100),
    city: 'Colombo',
    country: 'Sri Lanka',
    hash: payHereCheckoutHash({
      merchantId: input.credentials.merchantId,
      orderId: input.booking.id,
      amount,
      currency,
      merchantSecret: input.credentials.merchantSecret,
    }),
  };
}

export type ShalomPayHereCheckoutSessionResult =
  | {
      ok: true;
      fields: PayHereCheckoutFields;
      sandbox: boolean;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export function mapShalomPayHereCheckoutError(
  reason: 'not_found' | 'not_awaiting_payment' | 'not_configured' | 'invalid',
): ShalomPayHereCheckoutSessionResult {
  if (reason === 'not_found') {
    return { ok: false, status: 404, error: 'Booking not found.' };
  }
  if (reason === 'not_awaiting_payment') {
    return {
      ok: false,
      status: 409,
      error: 'This booking is not awaiting payment. Choose new dates or contact us for help.',
    };
  }
  if (reason === 'not_configured') {
    return {
      ok: false,
      status: 503,
      error:
        'Card payments are not configured yet. Please contact Shalom Residence to complete your booking.',
    };
  }
  return { ok: false, status: 400, error: 'Invalid payment request.' };
}
