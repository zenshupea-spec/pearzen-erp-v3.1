import { formatColomboGuestDate } from '../../lib/shalom-public-colombo-dates';
import {
  formatShalomPublicLkr,
  type ShalomPublicListingView,
} from '../../lib/shalom-public-listings';
import { shalomPublicDisplayClass } from '../../lib/shalom-public-tokens';

export default function ShalomBookStaySummary({
  listing,
  checkIn,
  checkOut,
  nights,
  totalLkr,
  guestCount,
  arrivalTime,
}: {
  listing: ShalomPublicListingView;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalLkr: number;
  guestCount?: number;
  arrivalTime?: string;
}) {
  return (
    <dl className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-4">
        <dt className="text-[color:var(--shalom-muted)]">Property</dt>
        <dd className="text-right font-semibold text-[color:var(--shalom-text)]">
          {listing.headline.trim() || listing.name}
        </dd>
      </div>
      {guestCount != null ? (
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[color:var(--shalom-muted)]">Guests</dt>
          <dd className="text-right font-semibold text-[color:var(--shalom-text)]">
            {guestCount}
          </dd>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[color:var(--shalom-muted)]">Max guests</dt>
          <dd className="text-right font-semibold text-[color:var(--shalom-text)]">
            {listing.maxGuests}
          </dd>
        </div>
      )}
      {arrivalTime?.trim() ? (
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[color:var(--shalom-muted)]">Arrival time</dt>
          <dd className="text-right font-semibold text-[color:var(--shalom-text)]">
            {arrivalTime.trim()}
          </dd>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <dt className="text-[color:var(--shalom-muted)]">Check-in</dt>
        <dd className="font-semibold text-[color:var(--shalom-text)]">
          {checkIn ? formatColomboGuestDate(checkIn) : '—'}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-4">
        <dt className="text-[color:var(--shalom-muted)]">Check-out</dt>
        <dd className="font-semibold text-[color:var(--shalom-text)]">
          {checkOut ? formatColomboGuestDate(checkOut) : '—'}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-4 border-t border-[color:var(--shalom-border)] pt-3">
        <dt className="text-[color:var(--shalom-muted)]">Nights</dt>
        <dd className="font-semibold text-[color:var(--shalom-text)]">{nights > 0 ? nights : '—'}</dd>
      </div>
      <div className="flex items-start justify-between gap-4">
        <dt className="text-[color:var(--shalom-muted)]">Nightly rate</dt>
        <dd className="font-semibold text-[color:var(--shalom-text)]">
          {formatShalomPublicLkr(listing.nightlyRateLkr)}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-4 border-t border-[color:var(--shalom-border)] pt-3">
        <dt className="text-base font-semibold text-[color:var(--shalom-text)]">Total</dt>
        <dd
          className={`text-xl font-semibold text-[color:var(--shalom-accent)] ${shalomPublicDisplayClass}`}
        >
          {totalLkr > 0 ? formatShalomPublicLkr(totalLkr) : '—'}
        </dd>
      </div>
    </dl>
  );
}

export const shalomBookFieldClass =
  'w-full rounded-xl border border-[color:var(--shalom-border)] bg-white px-3 py-2.5 text-sm text-[color:var(--shalom-text)] outline-none transition focus:border-[color:var(--shalom-accent)] focus:ring-2 focus:ring-[color:var(--shalom-accent-soft)]';

export const shalomBookLabelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[color:var(--shalom-muted)]';

export const shalomBookFieldErrorClass = 'mt-1 text-xs text-red-700';
