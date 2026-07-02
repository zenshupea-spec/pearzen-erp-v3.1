'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { ShalomDirectBookingCreated } from '../../lib/shalom-public-direct-booking';
import {
  colomboTodayIso,
  shiftColomboMonth,
  shalomBookingHorizonEndIso,
} from '../../lib/shalom-public-colombo-dates';
import {
  buildAvailabilityDays,
  calculateStayTotal,
  countStayNights,
  earliestShalomCheckInIso,
  isStayRangeAvailable,
  validateShalomGuestStayRules,
  type ShalomAvailabilityBooking,
  type ShalomPublicListingView,
} from '../../lib/shalom-public-listings';
import {
  shalomPublicButtonPrimaryClass,
  shalomPublicDisplayClass,
  shalomPublicSurfaceClass,
} from '../../lib/shalom-public-tokens';
import ShalomBookDatePicker from './ShalomBookDatePicker';
import ShalomBookGuestDetailsStep from './ShalomBookGuestDetailsStep';
import ShalomBookPaymentReady from './ShalomBookPaymentReady';
import ShalomBookStaySummary from './ShalomBookStaySummary';
import { useShalomPublicHref } from './useShalomPublicHref';

type ShalomBookFlowProps = {
  listing: ShalomPublicListingView;
  bookings: ShalomAvailabilityBooking[];
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuestCount?: number;
  initialArrivalTime?: string;
  paymentCancelled?: boolean;
};

type BookStep = 'dates' | 'details' | 'ready';

function isIsoDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseInitialRange(
  initialCheckIn: string | undefined,
  initialCheckOut: string | undefined,
  bookings: ShalomAvailabilityBooking[],
  listing: ShalomPublicListingView,
): { checkIn: string; checkOut: string } {
  if (
    initialCheckIn &&
    initialCheckOut &&
    isIsoDateKey(initialCheckIn) &&
    isIsoDateKey(initialCheckOut) &&
    validateShalomGuestStayRules({
      checkIn: initialCheckIn,
      checkOut: initialCheckOut,
      minNights: listing.minNights,
      leadHours: listing.bookingLeadHours,
    }).ok &&
    isStayRangeAvailable(bookings, initialCheckIn, initialCheckOut, { propertyId: listing.id })
  ) {
    return { checkIn: initialCheckIn, checkOut: initialCheckOut };
  }
  return { checkIn: '', checkOut: '' };
}

export default function ShalomBookFlow({
  listing,
  bookings,
  initialCheckIn,
  initialCheckOut,
  initialGuestCount,
  initialArrivalTime,
  paymentCancelled = false,
}: ShalomBookFlowProps) {
  const href = useShalomPublicHref();
  const todayIso = colomboTodayIso();
  const earliestCheckInIso = earliestShalomCheckInIso(listing.bookingLeadHours);
  const horizonEndIso = shalomBookingHorizonEndIso(todayIso);
  const initial = parseInitialRange(initialCheckIn, initialCheckOut, bookings, listing);
  const guestCount = initialGuestCount
    ? Math.min(listing.maxGuests, Math.max(1, Math.round(initialGuestCount)))
    : undefined;
  const arrivalTime = initialArrivalTime?.trim() || undefined;

  const [step, setStep] = useState<BookStep>(
    initial.checkIn && initial.checkOut ? 'details' : 'dates',
  );
  const [confirmedBooking, setConfirmedBooking] = useState<ShalomDirectBookingCreated | null>(
    null,
  );
  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const todayParts = useMemo(() => {
    const [year, month] = earliestCheckInIso.split('-').map(Number);
    return { year, month };
  }, [earliestCheckInIso]);

  const [viewYear, setViewYear] = useState(todayParts.year);
  const [viewMonth, setViewMonth] = useState(todayParts.month);

  const availabilityByDate = useMemo(() => {
    const days = buildAvailabilityDays(bookings, earliestCheckInIso, horizonEndIso, listing.id);
    return new Map(days.map((day) => [day.date, day.available]));
  }, [bookings, earliestCheckInIso, horizonEndIso, listing.id]);

  const nights = checkIn && checkOut ? countStayNights(checkIn, checkOut) : 0;
  const totalLkr = nights > 0 ? calculateStayTotal(nights, listing.nightlyRateLkr) : 0;
  const stayRulesValid =
    checkIn && checkOut
      ? validateShalomGuestStayRules({
          checkIn,
          checkOut,
          minNights: listing.minNights,
          leadHours: listing.bookingLeadHours,
        }).ok
      : false;
  const rangeIsValid =
    Boolean(checkIn && checkOut && nights > 0) &&
    stayRulesValid &&
    isStayRangeAvailable(bookings, checkIn, checkOut, { propertyId: listing.id });

  const canGoPrev =
    viewYear > todayParts.year ||
    (viewYear === todayParts.year && viewMonth > todayParts.month);

  const maxMonth = shiftColomboMonth(todayParts.year, todayParts.month, 11);
  const canGoNext =
    viewYear < maxMonth.year ||
    (viewYear === maxMonth.year && viewMonth < maxMonth.month);

  const handleSelectDate = (isoDate: string) => {
    setRangeError(null);
    setConfirmedBooking(null);

    if (!checkIn || (checkIn && checkOut)) {
      if (!availabilityByDate.get(isoDate)) {
        setRangeError('That check-in date is not available.');
        return;
      }
      setCheckIn(isoDate);
      setCheckOut('');
      return;
    }

    if (isoDate <= checkIn) {
      if (!availabilityByDate.get(isoDate)) {
        setRangeError('That check-in date is not available.');
        return;
      }
      setCheckIn(isoDate);
      setCheckOut('');
      return;
    }

    if (!isStayRangeAvailable(bookings, checkIn, isoDate, { propertyId: listing.id })) {
      setRangeError('Those dates overlap an existing stay or block. Try different dates.');
      setCheckOut('');
      return;
    }

    const stayRules = validateShalomGuestStayRules({
      checkIn,
      checkOut: isoDate,
      minNights: listing.minNights,
      leadHours: listing.bookingLeadHours,
    });
    if (!stayRules.ok) {
      setRangeError(stayRules.message);
      setCheckOut('');
      return;
    }

    setCheckOut(isoDate);
  };

  const goPrevMonth = () => {
    if (!canGoPrev) return;
    const shifted = shiftColomboMonth(viewYear, viewMonth, -1);
    setViewYear(shifted.year);
    setViewMonth(shifted.month);
  };

  const goNextMonth = () => {
    if (!canGoNext) return;
    const shifted = shiftColomboMonth(viewYear, viewMonth, 1);
    setViewYear(shifted.year);
    setViewMonth(shifted.month);
  };

  if (step === 'details') {
    return (
      <ShalomBookGuestDetailsStep
        listing={listing}
        checkIn={checkIn}
        checkOut={checkOut}
        nights={nights}
        totalLkr={totalLkr}
        guestCount={guestCount}
        arrivalTime={arrivalTime}
        onBack={() => {
          setConfirmedBooking(null);
          setStep('dates');
        }}
        onBookingCreated={(booking) => {
          setConfirmedBooking(booking);
          setStep('ready');
        }}
      />
    );
  }

  if (step === 'ready' && confirmedBooking) {
    return (
      <ShalomBookPaymentReady
        booking={confirmedBooking}
        onReviewDetails={() => setStep('details')}
      />
    );
  }

  const propertyTitle = listing.headline.trim() || listing.name;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-12">
      {paymentCancelled ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Payment was cancelled. Your dates are still selected — you can try PayHere checkout again
          after completing guest details.
        </p>
      ) : null}
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--shalom-accent)]">
          Step 1 of 2 · Dates
        </p>
        <h1
          className={`mt-2 text-3xl font-semibold text-[color:var(--shalom-text)] sm:text-4xl ${shalomPublicDisplayClass}`}
        >
          Choose your dates
        </h1>
        <p className="mt-2 text-sm text-[color:var(--shalom-muted)]">
          {propertyTitle}
          {listing.location ? ` · ${listing.location}` : ''}
        </p>
        <p className="mt-1 text-xs text-[color:var(--shalom-muted)]">
          All dates use Asia/Colombo time. Minimum stay:{' '}
          {listing.minNights === 1 ? '1 night' : `${listing.minNights} nights`}
          {listing.bookingLeadHours > 0
            ? ` · Book at least ${listing.bookingLeadHours} hour${
                listing.bookingLeadHours === 1 ? '' : 's'
              } before check-in (2:00 PM).`
            : ''}
          .
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
        <ShalomBookDatePicker
          viewYear={viewYear}
          viewMonth={viewMonth}
          earliestCheckInIso={earliestCheckInIso}
          horizonEndIso={horizonEndIso}
          availabilityByDate={availabilityByDate}
          checkIn={checkIn}
          checkOut={checkOut}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          rangeError={rangeError}
          onSelectDate={handleSelectDate}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
        />

        <aside className={`mt-8 p-6 lg:mt-0 ${shalomPublicSurfaceClass}`}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--shalom-muted)]">
            Your stay
          </h2>
          <div className="mt-4">
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

          <button
            type="button"
            disabled={!rangeIsValid}
            onClick={() => {
              setConfirmedBooking(null);
              setStep('details');
            }}
            className={`${shalomPublicButtonPrimaryClass} mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Continue to guest details
          </button>
          <p className="mt-3 text-center text-xs text-[color:var(--shalom-muted)]">
            Guest details and payment come next.
          </p>

          <Link
            href={href(`/properties/${listing.slug}`)}
            className="mt-4 block text-center text-xs font-semibold text-[color:var(--shalom-accent)] hover:text-[color:var(--shalom-accent-hover)]"
          >
            Back to property
          </Link>
        </aside>
      </div>
    </div>
  );
}
