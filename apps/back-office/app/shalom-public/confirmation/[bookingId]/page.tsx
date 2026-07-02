import Link from 'next/link';
import { notFound } from 'next/navigation';

import ShalomConfirmationToolbar from '../../../../components/shalom-public/ShalomConfirmationToolbar';
import { formatColomboGuestDate } from '../../../../lib/shalom-public-colombo-dates';
import {
  buildShalomGuestGoogleCalendarUrl,
  formatShalomBookingReferenceId,
  isShalomGuestBookingConfirmed,
} from '../../../../lib/shalom-public-confirmation';
import {
  fetchShalomGuestConfirmationBooking,
  shalomGuestConfirmationEmailAvailable,
} from '../../../../lib/shalom-public-confirmation-server';
import { formatShalomPublicLkr } from '../../../../lib/shalom-public-listings';
import { shalomPublicHref } from '../../../../lib/shalom-public-path';
import {
  buildShalomPublicPageMetadata,
  SHALOM_PUBLIC_NOINDEX_ROBOTS,
} from '../../../../lib/shalom-public-seo';
import {
  shalomPublicButtonPrimaryClass,
  shalomPublicDisplayClass,
  shalomPublicSurfaceClass,
} from '../../../../lib/shalom-public-tokens';

type PageProps = {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ status?: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { bookingId } = await params;
  const reference = formatShalomBookingReferenceId(bookingId);
  return buildShalomPublicPageMetadata({
    title: `Booking ${reference}`,
    description: 'Your Shalom Residence booking confirmation.',
    path: `/confirmation/${bookingId.trim().toLowerCase()}`,
    robots: SHALOM_PUBLIC_NOINDEX_ROBOTS,
  });
}

export default async function ShalomConfirmationPage({ params, searchParams }: PageProps) {
  const { bookingId } = await params;
  const query = await searchParams;
  const normalizedId = bookingId.trim().toLowerCase();

  const booking = await fetchShalomGuestConfirmationBooking(normalizedId);
  if (!booking) {
    notFound();
  }

  const returnedFromPayHere = query.status === 'return';
  const isConfirmed = isShalomGuestBookingConfirmed(booking);
  const isPending = booking.bookingStatus === 'PENDING_PAYMENT' && !booking.paid;
  const reference = formatShalomBookingReferenceId(booking.bookingId);
  const calendarUrl = isConfirmed ? buildShalomGuestGoogleCalendarUrl(booking) : null;
  const emailConfigured = shalomGuestConfirmationEmailAvailable();

  return (
    <section className="mx-auto max-w-2xl px-5 py-16 lg:px-8 lg:py-24">
      <div className={`px-6 py-8 sm:px-8 ${shalomPublicSurfaceClass}`} id="shalom-confirmation">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--shalom-accent)]">
            Booking confirmation
          </p>
          <h1
            className={`mt-3 text-2xl font-semibold text-[color:var(--shalom-text)] sm:text-3xl ${shalomPublicDisplayClass}`}
          >
            {isConfirmed
              ? 'Payment received'
              : returnedFromPayHere
                ? 'Payment processing'
                : 'Booking status'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--shalom-muted)]">
            {isConfirmed
              ? `Thank you, ${booking.guestName}. Your stay at ${booking.propertyName} is confirmed.`
              : isPending && returnedFromPayHere
                ? 'PayHere is confirming your payment. This page will update once verification completes — usually within a minute.'
                : isPending
                  ? 'This booking is reserved and awaiting payment.'
                  : 'This booking is no longer awaiting payment.'}
          </p>
        </div>

        <dl className="mt-8 space-y-3 border-t border-[color:var(--shalom-border)] pt-6 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[color:var(--shalom-muted)]">Reference</dt>
            <dd className="text-right font-mono text-xs font-semibold text-[color:var(--shalom-text)] sm:text-sm">
              {reference}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[color:var(--shalom-muted)]">Property</dt>
            <dd className="text-right font-semibold text-[color:var(--shalom-text)]">
              {booking.propertySlug ? (
                <Link
                  href={shalomPublicHref(`/properties/${booking.propertySlug}`)}
                  className="text-[color:var(--shalom-accent)] hover:underline"
                >
                  {booking.propertyName}
                </Link>
              ) : (
                booking.propertyName
              )}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[color:var(--shalom-muted)]">Check-in</dt>
            <dd className="font-semibold text-[color:var(--shalom-text)]">
              {booking.checkIn ? formatColomboGuestDate(booking.checkIn) : '—'}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[color:var(--shalom-muted)]">Check-out</dt>
            <dd className="font-semibold text-[color:var(--shalom-text)]">
              {booking.checkOut ? formatColomboGuestDate(booking.checkOut) : '—'}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[color:var(--shalom-muted)]">Nights</dt>
            <dd className="font-semibold text-[color:var(--shalom-text)]">
              {booking.nights > 0 ? booking.nights : '—'}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-[color:var(--shalom-border)] pt-3">
            <dt className="text-base font-semibold text-[color:var(--shalom-text)]">Total</dt>
            <dd
              className={`text-xl font-semibold text-[color:var(--shalom-accent)] ${shalomPublicDisplayClass}`}
            >
              {booking.totalLkr > 0 ? formatShalomPublicLkr(booking.totalLkr) : '—'}
            </dd>
          </div>
        </dl>

        <p className="mt-4 rounded-lg border border-[color:var(--shalom-border)] bg-[color:var(--shalom-bg)]/60 px-3 py-2 font-mono text-[10px] leading-relaxed text-[color:var(--shalom-muted)] sm:text-xs">
          Full reference: {booking.bookingId}
        </p>

        {isConfirmed ? (
          <ShalomConfirmationToolbar
            bookingId={booking.bookingId}
            calendarUrl={calendarUrl}
            emailConfigured={emailConfigured}
          />
        ) : null}

        <div className="mt-8 text-center print:hidden">
          <Link href={shalomPublicHref('/')} className={shalomPublicButtonPrimaryClass}>
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
