'use client';

import { useState, useTransition } from 'react';

import type { ShalomDirectBookingCreated } from '../../lib/shalom-public-direct-booking';
import { formatShalomPublicLkr } from '../../lib/shalom-public-listings';
import {
  shalomPublicButtonGhostClass,
  shalomPublicButtonPrimaryClass,
  shalomPublicDisplayClass,
  shalomPublicSurfaceClass,
} from '../../lib/shalom-public-tokens';
import { startShalomPayHereCheckout } from './shalom-payhere-client';

export default function ShalomBookPaymentReady({
  booking,
  onReviewDetails,
}: {
  booking: ShalomDirectBookingCreated;
  onReviewDetails: () => void;
}) {
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handlePay = () => {
    setPaymentError(null);
    startTransition(async () => {
      const result = await startShalomPayHereCheckout(booking.bookingId);
      if (!result.ok) {
        setPaymentError(result.error ?? 'Could not open PayHere checkout.');
      }
    });
  };

  return (
    <div className="mx-auto max-w-lg px-5 py-16 lg:px-8 lg:py-24">
      <div className={`px-6 py-8 text-center ${shalomPublicSurfaceClass}`}>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--shalom-accent)]">
          Reservation held
        </p>
        <h1
          className={`mt-3 text-2xl font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
        >
          Pay with PayHere
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--shalom-muted)]">
          Thanks, {booking.guestName}. Your stay at {booking.propertyName} is held for 30 minutes
          while you complete secure checkout.
        </p>
        <p className="mt-4 text-sm font-semibold text-[color:var(--shalom-accent)]">
          {formatShalomPublicLkr(booking.totalLkr)} · {booking.nights}{' '}
          {booking.nights === 1 ? 'night' : 'nights'}
        </p>
        <p className="mt-4 rounded-lg border border-[color:var(--shalom-border)] bg-[color:var(--shalom-bg)]/60 px-3 py-2 font-mono text-xs text-[color:var(--shalom-muted)]">
          Booking reference: {booking.bookingId}
        </p>

        {paymentError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {paymentError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handlePay}
          disabled={isPending}
          className={`${shalomPublicButtonPrimaryClass} mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {isPending ? 'Opening PayHere…' : 'Pay with PayHere'}
        </button>
        <button
          type="button"
          onClick={onReviewDetails}
          disabled={isPending}
          className={`${shalomPublicButtonGhostClass} mt-3 w-full`}
        >
          Review guest details
        </button>
        <p className="mt-3 text-xs text-[color:var(--shalom-muted)]">
          You will be redirected to PayHere to pay by card. Your booking stays pending until payment
          is confirmed.
        </p>
      </div>
    </div>
  );
}
