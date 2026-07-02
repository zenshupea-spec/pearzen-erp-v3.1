import { describe, expect, it } from 'vitest';

import { payHereNotifyHash } from '../../../packages/cafe-customer-order/payhere';

import {
  isPayHerePaymentSuccessful,
  isShalomBookingAlreadyConfirmed,
  isShalomBookingNotifyIdempotentSuccess,
  parsePayHereNotifyPayload,
  shalomBookingMatchesPayHereAmount,
  verifyPayHereNotifySignature,
} from './shalom-public-payhere-notify';

describe('shalom-public-payhere-notify', () => {
  const merchantId = '1234567';
  const merchantSecret = 'secret';
  const orderId = '11111111-1111-4111-8111-111111111111';
  const amount = '45000.00';
  const currency = 'LKR';
  const statusCode = '2';
  const paymentId = '320012345678';

  function buildForm(overrides: Record<string, string> = {}) {
    const md5sig =
      overrides.md5sig ??
      payHereNotifyHash({
        merchantId,
        orderId,
        amount,
        currency,
        statusCode: overrides.status_code ?? statusCode,
        merchantSecret,
      });

    const form = new FormData();
    form.set('order_id', overrides.order_id ?? orderId);
    form.set('payment_id', overrides.payment_id ?? paymentId);
    form.set('payhere_amount', overrides.payhere_amount ?? amount);
    form.set('payhere_currency', overrides.payhere_currency ?? currency);
    form.set('status_code', overrides.status_code ?? statusCode);
    form.set('md5sig', md5sig);
    return form;
  }

  it('parses notify payload from form data', () => {
    const payload = parsePayHereNotifyPayload(buildForm());
    expect(payload?.orderId).toBe(orderId);
    expect(payload?.paymentId).toBe(paymentId);
  });

  it('verifies notify signature', () => {
    const payload = parsePayHereNotifyPayload(buildForm());
    expect(payload).not.toBeNull();
    expect(
      verifyPayHereNotifySignature({
        payload: payload!,
        merchantId,
        merchantSecret,
      }),
    ).toBe(true);
  });

  it('detects successful PayHere status code', () => {
    expect(isPayHerePaymentSuccessful('2')).toBe(true);
    expect(isPayHerePaymentSuccessful('-2')).toBe(false);
  });

  it('matches booking totals to PayHere amount', () => {
    expect(shalomBookingMatchesPayHereAmount({ totalRevenueLkr: 45000 }, '45000.00')).toBe(true);
    expect(shalomBookingMatchesPayHereAmount({ totalRevenueLkr: 45000 }, '46000.00')).toBe(false);
  });

  it('treats confirmed bookings as idempotent notify targets', () => {
    const booking = {
      id: orderId,
      companyId: 'co-1',
      totalRevenueLkr: 45000,
      channel: 'DIRECT',
      bookingStatus: 'CONFIRMED',
      paid: true,
      payherePaymentId: paymentId,
    };

    expect(isShalomBookingAlreadyConfirmed(booking)).toBe(true);
    expect(isShalomBookingNotifyIdempotentSuccess(booking, paymentId)).toBe(true);
  });
});
