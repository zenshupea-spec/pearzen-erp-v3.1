import 'server-only';

import { resolvePayHereCredentialsForCompany } from '../../../packages/cafe-customer-order/tenant-payhere-server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';

import {
  isPayHerePaymentSuccessful,
  isShalomBookingAlreadyConfirmed,
  isShalomBookingNotifyIdempotentSuccess,
  isShalomDirectBookingNotifyTarget,
  mapShalomPayHereNotifyFailure,
  parsePayHereNotifyPayload,
  shalomBookingMatchesPayHereAmount,
  verifyPayHereNotifySignature,
  type ShalomPayHereNotifyBooking,
  type ShalomPayHereNotifyResult,
} from './shalom-public-payhere-notify';
import { sendShalomGuestConfirmationEmailForBookingId } from './shalom-public-confirmation-server';
import { notifyShalomDirectBookingConfirmed } from './shalom-direct-booking-alert-server';

function mapNotifyBookingRow(row: Record<string, unknown>): ShalomPayHereNotifyBooking | null {
  const id = typeof row.id === 'string' ? row.id : null;
  const companyId = typeof row.company_id === 'string' ? row.company_id : null;
  if (!id || !companyId) return null;

  return {
    id,
    companyId,
    totalRevenueLkr: Number(row.total_revenue) || 0,
    channel: typeof row.channel === 'string' ? row.channel : '',
    bookingStatus: typeof row.booking_status === 'string' ? row.booking_status : '',
    paid: Boolean(row.paid),
    payherePaymentId:
      typeof row.payhere_payment_id === 'string' ? row.payhere_payment_id.trim() : '',
  };
}

export async function handleShalomPayHereNotify(form: FormData): Promise<ShalomPayHereNotifyResult> {
  const payload = parsePayHereNotifyPayload(form);
  if (!payload) {
    return mapShalomPayHereNotifyFailure('invalid');
  }

  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('shalom_bookings')
    .select('id, company_id, total_revenue, channel, booking_status, paid, payhere_payment_id')
    .eq('id', payload.orderId)
    .maybeSingle();

  if (error || !data) {
    return mapShalomPayHereNotifyFailure('not_found');
  }

  const booking = mapNotifyBookingRow(data as Record<string, unknown>);
  if (!booking) {
    return mapShalomPayHereNotifyFailure('not_found');
  }

  if (!isShalomDirectBookingNotifyTarget(booking)) {
    return mapShalomPayHereNotifyFailure('not_direct');
  }

  const credentials = await resolvePayHereCredentialsForCompany(booking.companyId);
  if (!credentials) {
    return mapShalomPayHereNotifyFailure('not_configured');
  }

  if (
    !verifyPayHereNotifySignature({
      payload,
      merchantId: credentials.merchantId,
      merchantSecret: credentials.merchantSecret,
    })
  ) {
    return mapShalomPayHereNotifyFailure('forbidden');
  }

  if (isShalomBookingNotifyIdempotentSuccess(booking, payload.paymentId)) {
    return { ok: true, confirmed: true, idempotent: true };
  }

  if (!isPayHerePaymentSuccessful(payload.statusCode)) {
    return { ok: true, confirmed: false };
  }

  if (!shalomBookingMatchesPayHereAmount(booking, payload.amount)) {
    return mapShalomPayHereNotifyFailure('amount_mismatch');
  }

  if (isShalomBookingAlreadyConfirmed(booking)) {
    return { ok: true, confirmed: true, idempotent: true };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from('shalom_bookings')
    .update({
      paid: true,
      booking_status: 'CONFIRMED',
      payhere_payment_id: payload.paymentId || booking.payherePaymentId,
      pending_payment_expires_at: null,
      updated_at: nowIso,
    })
    .eq('id', booking.id)
    .eq('channel', 'DIRECT')
    .eq('booking_status', 'PENDING_PAYMENT')
    .eq('paid', false)
    .select('id')
    .maybeSingle();

  if (updateError) {
    console.error('handleShalomPayHereNotify update:', updateError.message);
    return mapShalomPayHereNotifyFailure('update_failed');
  }

  if (updated?.id) {
    void sendShalomGuestConfirmationEmailForBookingId(updated.id).then((emailResult) => {
      if (!emailResult.ok && emailResult.error) {
        console.error('handleShalomPayHereNotify email:', emailResult.error);
      }
    });
    void notifyShalomDirectBookingConfirmed(updated.id).then((alertResult) => {
      if (!alertResult.ok && alertResult.error) {
        console.error('handleShalomPayHereNotify alert:', alertResult.error);
      }
    });
    return { ok: true, confirmed: true };
  }

  const { data: latest } = await db
    .from('shalom_bookings')
    .select('paid, booking_status, payhere_payment_id')
    .eq('id', booking.id)
    .maybeSingle();

  if (
    latest &&
    isShalomBookingNotifyIdempotentSuccess(
      {
        ...booking,
        paid: Boolean(latest.paid),
        bookingStatus: String(latest.booking_status ?? ''),
        payherePaymentId: String(latest.payhere_payment_id ?? ''),
      },
      payload.paymentId,
    )
  ) {
    return { ok: true, confirmed: true, idempotent: true };
  }

  return { ok: true, confirmed: false };
}
