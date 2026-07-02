import { describe, expect, it } from 'vitest';

import {
  buildShalomPayHereCancelUrl,
  buildShalomPayHereCheckoutFields,
  buildShalomPayHereReturnUrl,
  isShalomBookingAwaitingPayment,
  splitShalomGuestName,
} from './shalom-public-payhere';

describe('shalom-public-payhere', () => {
  const booking = {
    id: '11111111-1111-4111-8111-111111111111',
    companyId: 'co-1',
    propertyId: 'prop-1',
    propertySlug: 'garden-villa',
    propertyName: 'Garden Villa',
    propertyLocation: 'Nawala, Colombo',
    guestName: 'Amaya Perera',
    guestEmail: 'amaya@example.com',
    guestPhone: '+94 77 123 4567',
    checkIn: '2026-08-01',
    checkOut: '2026-08-04',
    nights: 3,
    totalRevenueLkr: 45000,
    bookingStatus: 'PENDING_PAYMENT',
    channel: 'DIRECT',
    paid: false,
    pendingPaymentExpiresAt: '2026-08-01T13:00:00.000Z',
  };

  it('splits guest names for PayHere', () => {
    expect(splitShalomGuestName('Amaya Perera')).toEqual({
      first: 'Amaya',
      last: 'Perera',
    });
  });

  it('detects bookings awaiting payment', () => {
    expect(
      isShalomBookingAwaitingPayment(booking, new Date('2026-08-01T12:00:00.000Z')),
    ).toBe(true);
    expect(
      isShalomBookingAwaitingPayment(
        { ...booking, pendingPaymentExpiresAt: '2026-08-01T11:00:00.000Z' },
        new Date('2026-08-01T12:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('builds checkout fields with hash and URLs', () => {
    process.env.NEXT_PUBLIC_SHALOM_PUBLIC_URL = 'https://shalom.pearzen.tech';
    process.env.NEXT_PUBLIC_SHALOM_PAYHERE_NOTIFY_URL = 'https://erp.example.com';

    const fields = buildShalomPayHereCheckoutFields({
      booking,
      credentials: {
        merchantId: '1234567',
        merchantSecret: 'secret',
        sandbox: true,
        source: 'tenant',
      },
    });

    expect(fields.order_id).toBe(booking.id);
    expect(fields.return_url).toBe(
      buildShalomPayHereReturnUrl(booking.id),
    );
    expect(fields.cancel_url).toContain('/book/garden-villa');
    expect(fields.cancel_url).toContain('checkIn=2026-08-01');
    expect(fields.notify_url).toBe('https://erp.example.com/api/shalom-public/payhere-notify');
    expect(fields.hash).toMatch(/^[A-F0-9]{32}$/);
  });
});
