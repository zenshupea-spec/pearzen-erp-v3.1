import { formatPayHereAmount, payHereNotifyHash } from '../../../packages/cafe-customer-order/payhere';

export type PayHereNotifyPayload = {
  orderId: string;
  paymentId: string;
  amount: string;
  currency: string;
  statusCode: string;
  md5sig: string;
};

export type ShalomPayHereNotifyBooking = {
  id: string;
  companyId: string;
  totalRevenueLkr: number;
  channel: string;
  bookingStatus: string;
  paid: boolean;
  payherePaymentId: string;
};

export function parsePayHereNotifyPayload(form: FormData): PayHereNotifyPayload | null {
  const orderId = String(form.get('order_id') ?? '').trim();
  const paymentId = String(form.get('payment_id') ?? '').trim();
  const amount = String(form.get('payhere_amount') ?? '').trim();
  const currency = String(form.get('payhere_currency') ?? '').trim();
  const statusCode = String(form.get('status_code') ?? '').trim();
  const md5sig = String(form.get('md5sig') ?? '').trim().toUpperCase();

  if (!orderId || !md5sig) return null;

  return {
    orderId,
    paymentId,
    amount,
    currency,
    statusCode,
    md5sig,
  };
}

export function verifyPayHereNotifySignature(input: {
  payload: PayHereNotifyPayload;
  merchantId: string;
  merchantSecret: string;
}): boolean {
  const expected = payHereNotifyHash({
    merchantId: input.merchantId,
    orderId: input.payload.orderId,
    amount: input.payload.amount,
    currency: input.payload.currency,
    statusCode: input.payload.statusCode,
    merchantSecret: input.merchantSecret,
  });

  return expected === input.payload.md5sig.toUpperCase();
}

export function isPayHerePaymentSuccessful(statusCode: string): boolean {
  return statusCode.trim() === '2';
}

export function isShalomDirectBookingNotifyTarget(
  booking: Pick<ShalomPayHereNotifyBooking, 'channel'>,
): boolean {
  return booking.channel === 'DIRECT';
}

export function isShalomBookingAlreadyConfirmed(
  booking: Pick<ShalomPayHereNotifyBooking, 'paid' | 'bookingStatus' | 'payherePaymentId'>,
): boolean {
  if (!booking.paid) return false;
  return booking.bookingStatus === 'CONFIRMED';
}

/** Idempotent success — same PayHere payment retried. */
export function isShalomBookingNotifyIdempotentSuccess(
  booking: ShalomPayHereNotifyBooking,
  paymentId: string,
): boolean {
  if (!isShalomBookingAlreadyConfirmed(booking)) return false;
  if (!paymentId) return true;
  return booking.payherePaymentId === paymentId || !booking.payherePaymentId;
}

export function shalomBookingMatchesPayHereAmount(
  booking: Pick<ShalomPayHereNotifyBooking, 'totalRevenueLkr'>,
  payhereAmount: string,
): boolean {
  if (!payhereAmount.trim()) return false;
  return formatPayHereAmount(booking.totalRevenueLkr) === payhereAmount.trim();
}

export type ShalomPayHereNotifyResult =
  | { ok: true; confirmed: boolean; idempotent?: boolean }
  | { ok: false; status: number };

export function mapShalomPayHereNotifyFailure(
  reason: 'invalid' | 'not_found' | 'forbidden' | 'amount_mismatch' | 'not_configured' | 'not_direct' | 'update_failed',
): ShalomPayHereNotifyResult {
  if (reason === 'invalid') return { ok: false, status: 400 };
  if (reason === 'not_found' || reason === 'not_direct') return { ok: false, status: 404 };
  if (reason === 'forbidden' || reason === 'amount_mismatch') return { ok: false, status: 403 };
  if (reason === 'update_failed') return { ok: false, status: 500 };
  return { ok: false, status: 503 };
}
