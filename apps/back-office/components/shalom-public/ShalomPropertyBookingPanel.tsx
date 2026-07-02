'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  colomboTodayIso,
  shalomBookingHorizonEndIso,
} from '../../lib/shalom-public-colombo-dates';
import {
  calculateStayTotal,
  countStayNights,
  earliestShalomCheckInIso,
  formatShalomPublicLkr,
  isStayRangeAvailable,
  SHALOM_CHECK_IN_HOUR_COLOMBO,
  validateShalomGuestStayRules,
  type ShalomAvailabilityBooking,
  type ShalomPublicListingView,
} from '../../lib/shalom-public-listings';
import {
  shalomPublicButtonPrimaryClass,
  shalomPublicDisplayClass,
  shalomPublicSurfaceClass,
} from '../../lib/shalom-public-tokens';
import ShalomBookStaySummary, {
  shalomBookFieldClass,
  shalomBookFieldErrorClass,
  shalomBookLabelClass,
} from './ShalomBookStaySummary';
import { useShalomPublicHref } from './useShalomPublicHref';

function defaultArrivalTime(): string {
  return `${String(SHALOM_CHECK_IN_HOUR_COLOMBO).padStart(2, '0')}:00`;
}

function clampGuestCount(value: number, maxGuests: number): number {
  const max = Math.max(1, maxGuests);
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(1, Math.round(value)));
}

export default function ShalomPropertyBookingPanel({
  listing,
  bookings,
  layout = 'sidebar',
}: {
  listing: ShalomPublicListingView;
  bookings: ShalomAvailabilityBooking[];
  layout?: 'sidebar' | 'inline';
}) {
  const href = useShalomPublicHref();
  const todayIso = colomboTodayIso();
  const earliestCheckInIso = earliestShalomCheckInIso(listing.bookingLeadHours);
  const horizonEndIso = shalomBookingHorizonEndIso(todayIso);

  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestCount, setGuestCount] = useState(() =>
    clampGuestCount(Math.min(2, listing.maxGuests), listing.maxGuests),
  );
  const [arrivalTime, setArrivalTime] = useState(defaultArrivalTime);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const nights = checkIn && checkOut ? countStayNights(checkIn, checkOut) : 0;
  const totalLkr = nights > 0 ? calculateStayTotal(nights, listing.nightlyRateLkr) : 0;

  const rangeIsValid = useMemo(() => {
    if (!checkIn || !checkOut || nights < 1) return false;

    const stayRules = validateShalomGuestStayRules({
      checkIn,
      checkOut,
      minNights: listing.minNights,
      leadHours: listing.bookingLeadHours,
    });
    if (!stayRules.ok) return false;

    return isStayRangeAvailable(bookings, checkIn, checkOut, { propertyId: listing.id });
  }, [bookings, checkIn, checkOut, listing, nights]);

  const validateSelection = (): boolean => {
    setRangeError(null);

    if (!checkIn || !checkOut) {
      setRangeError('Please choose check-in and check-out dates.');
      return false;
    }

    const stayRules = validateShalomGuestStayRules({
      checkIn,
      checkOut,
      minNights: listing.minNights,
      leadHours: listing.bookingLeadHours,
    });
    if (!stayRules.ok) {
      setRangeError(stayRules.message);
      return false;
    }

    if (!isStayRangeAvailable(bookings, checkIn, checkOut, { propertyId: listing.id })) {
      setRangeError('Those dates overlap an existing stay or block. Try different dates.');
      return false;
    }

    if (guestCount > listing.maxGuests) {
      setRangeError(`This stay allows up to ${listing.maxGuests} guests.`);
      return false;
    }

    return true;
  };

  const continueHref = useMemo(() => {
    const params = new URLSearchParams();
    if (checkIn) params.set('checkIn', checkIn);
    if (checkOut) params.set('checkOut', checkOut);
    params.set('guests', String(guestCount));
    if (arrivalTime.trim()) params.set('arrivalTime', arrivalTime.trim());
    const query = params.toString();
    return href(`/book/${listing.slug}${query ? `?${query}` : ''}`);
  }, [arrivalTime, checkIn, checkOut, guestCount, href, listing.slug]);

  return (
    <aside className={`${layout === 'sidebar' ? 'p-6' : 'p-5'} ${shalomPublicSurfaceClass}`}>
      <p className="text-sm text-[color:var(--shalom-muted)]">From</p>
      <p className={`mt-1 text-3xl font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}>
        {formatShalomPublicLkr(listing.nightlyRateLkr)}
        <span className="text-base font-normal text-[color:var(--shalom-muted)]"> / night</span>
      </p>

      <form
        className="mt-6 space-y-4 border-t border-[color:var(--shalom-border)] pt-5"
        onSubmit={(event) => event.preventDefault()}
      >
        <div>
          <label className={shalomBookLabelClass} htmlFor={`check-in-${listing.id}`}>
            Check-in
          </label>
          <input
            id={`check-in-${listing.id}`}
            type="date"
            className={shalomBookFieldClass}
            min={earliestCheckInIso}
            max={horizonEndIso}
            value={checkIn}
            onChange={(event) => {
              setRangeError(null);
              const next = event.target.value;
              setCheckIn(next);
              if (checkOut && next >= checkOut) setCheckOut('');
            }}
          />
        </div>

        <div>
          <label className={shalomBookLabelClass} htmlFor={`check-out-${listing.id}`}>
            Check-out
          </label>
          <input
            id={`check-out-${listing.id}`}
            type="date"
            className={shalomBookFieldClass}
            min={checkIn || earliestCheckInIso}
            max={horizonEndIso}
            value={checkOut}
            disabled={!checkIn}
            onChange={(event) => {
              setRangeError(null);
              setCheckOut(event.target.value);
            }}
          />
        </div>

        <div>
          <label className={shalomBookLabelClass} htmlFor={`guests-${listing.id}`}>
            Guests
          </label>
          <input
            id={`guests-${listing.id}`}
            type="number"
            min={1}
            max={listing.maxGuests}
            className={shalomBookFieldClass}
            value={guestCount}
            onChange={(event) => {
              setRangeError(null);
              setGuestCount(clampGuestCount(Number(event.target.value), listing.maxGuests));
            }}
          />
          <p className="mt-1 text-xs text-[color:var(--shalom-muted)]">
            Maximum {listing.maxGuests} {listing.maxGuests === 1 ? 'guest' : 'guests'}
          </p>
        </div>

        <div>
          <label className={shalomBookLabelClass} htmlFor={`arrival-${listing.id}`}>
            Arrival time
          </label>
          <input
            id={`arrival-${listing.id}`}
            type="time"
            className={shalomBookFieldClass}
            value={arrivalTime}
            onChange={(event) => {
              setRangeError(null);
              setArrivalTime(event.target.value);
            }}
          />
          <p className="mt-1 text-xs text-[color:var(--shalom-muted)]">
            Standard check-in from {String(SHALOM_CHECK_IN_HOUR_COLOMBO).padStart(2, '0')}:00 (Colombo)
          </p>
        </div>

        <p className="text-xs text-[color:var(--shalom-muted)]">
          Minimum stay: {listing.minNights === 1 ? '1 night' : `${listing.minNights} nights`}
          {listing.bookingLeadHours > 0
            ? ` · Book ${listing.bookingLeadHours}h+ before check-in`
            : ''}
        </p>

        {rangeError ? <p className={shalomBookFieldErrorClass}>{rangeError}</p> : null}

        {rangeIsValid ? (
          <div className="rounded-xl border border-[color:var(--shalom-border)] bg-white/60 p-4">
            <ShalomBookStaySummary
              listing={listing}
              checkIn={checkIn}
              checkOut={checkOut}
              nights={nights}
              totalLkr={totalLkr}
              guestCount={guestCount}
              arrivalTime={arrivalTime}
            />
          </div>
        ) : null}

        {rangeIsValid ? (
          <Link
            href={continueHref}
            className={`${shalomPublicButtonPrimaryClass} w-full`}
            onClick={() => validateSelection()}
          >
            Continue to guest details
          </Link>
        ) : (
          <button
            type="button"
            onClick={validateSelection}
            className={`${shalomPublicButtonPrimaryClass} w-full`}
          >
            Check availability
          </button>
        )}
      </form>

      <p className="mt-3 text-center text-xs text-[color:var(--shalom-muted)]">
        Secure direct booking · PayHere checkout
      </p>
    </aside>
  );
}
