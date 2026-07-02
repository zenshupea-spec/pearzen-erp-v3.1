'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { createShalomDirectBookingAction } from '../../app/shalom-public/book/shalom-book-actions';
import { ECOMMERCE_POLICY_PATHS } from '../../../../packages/ecommerce-policies';
import { validateShalomGuestDetails } from '../../lib/shalom-public-guest-details';
import type { ShalomDirectBookingCreated } from '../../lib/shalom-public-direct-booking';
import { shalomPublicHref } from '../../lib/shalom-public-path';
import {
  shalomPublicButtonGhostClass,
  shalomPublicButtonPrimaryClass,
  shalomPublicDisplayClass,
  shalomPublicSurfaceClass,
} from '../../lib/shalom-public-tokens';
import type { ShalomPublicListingView } from '../../lib/shalom-public-listings';
import ShalomBookStaySummary, {
  shalomBookFieldClass,
  shalomBookFieldErrorClass,
  shalomBookLabelClass,
} from './ShalomBookStaySummary';

type GuestFormState = {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  specialRequests: string;
  acceptedTerms: boolean;
  acceptedCancellation: boolean;
};

type ShalomBookGuestDetailsStepProps = {
  listing: ShalomPublicListingView;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalLkr: number;
  guestCount?: number;
  arrivalTime?: string;
  onBack: () => void;
  onBookingCreated: (booking: ShalomDirectBookingCreated) => void;
};

function buildStayPrefillNote(guestCount?: number, arrivalTime?: string): string {
  const parts: string[] = [];
  if (guestCount != null) {
    parts.push(`Party size: ${guestCount} guest${guestCount === 1 ? '' : 's'}`);
  }
  if (arrivalTime?.trim()) {
    parts.push(`Expected arrival: ${arrivalTime.trim()}`);
  }
  return parts.join(' · ');
}

export default function ShalomBookGuestDetailsStep({
  listing,
  checkIn,
  checkOut,
  nights,
  totalLkr,
  guestCount,
  arrivalTime,
  onBack,
  onBookingCreated,
}: ShalomBookGuestDetailsStepProps) {
  const [form, setForm] = useState<GuestFormState>({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    specialRequests: buildStayPrefillNote(guestCount, arrivalTime),
    acceptedTerms: false,
    acceptedCancellation: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const updateField = <K extends keyof GuestFormState>(key: K, value: GuestFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const clientValidation = validateShalomGuestDetails(form);
    if (!clientValidation.ok) {
      setFieldErrors(clientValidation.fieldErrors);
      return;
    }

    setFieldErrors({});

    startTransition(async () => {
      const result = await createShalomDirectBookingAction({
        propertySlug: listing.slug,
        checkIn,
        checkOut,
        ...form,
      });

      if (!result.ok) {
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        setFormError(result.error ?? 'Please check your details and try again.');
        return;
      }

      onBookingCreated(result.booking);
    });
  };

  const propertyTitle = listing.headline.trim() || listing.name;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-12">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--shalom-accent)]">
          Step 2 of 2 · Guest details
        </p>
        <h1
          className={`mt-2 text-3xl font-semibold text-[color:var(--shalom-text)] sm:text-4xl ${shalomPublicDisplayClass}`}
        >
          Your details
        </h1>
        <p className="mt-2 text-sm text-[color:var(--shalom-muted)]">
          {propertyTitle}
          {listing.location ? ` · ${listing.location}` : ''}
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
        <form
          onSubmit={handleSubmit}
          className={`p-5 sm:p-6 ${shalomPublicSurfaceClass}`}
          noValidate
        >
          <div className="space-y-5">
            <div>
              <label htmlFor="guestName" className={shalomBookLabelClass}>
                Full name
              </label>
              <input
                id="guestName"
                name="guestName"
                type="text"
                autoComplete="name"
                value={form.guestName}
                onChange={(event) => updateField('guestName', event.target.value)}
                className={shalomBookFieldClass}
                required
              />
              {fieldErrors.guestName ? (
                <p className={shalomBookFieldErrorClass}>{fieldErrors.guestName}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="guestEmail" className={shalomBookLabelClass}>
                Email
              </label>
              <input
                id="guestEmail"
                name="guestEmail"
                type="email"
                autoComplete="email"
                value={form.guestEmail}
                onChange={(event) => updateField('guestEmail', event.target.value)}
                className={shalomBookFieldClass}
                required
              />
              {fieldErrors.guestEmail ? (
                <p className={shalomBookFieldErrorClass}>{fieldErrors.guestEmail}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="guestPhone" className={shalomBookLabelClass}>
                Phone
              </label>
              <input
                id="guestPhone"
                name="guestPhone"
                type="tel"
                autoComplete="tel"
                value={form.guestPhone}
                onChange={(event) => updateField('guestPhone', event.target.value)}
                className={shalomBookFieldClass}
                placeholder="+94 77 123 4567"
                required
              />
              {fieldErrors.guestPhone ? (
                <p className={shalomBookFieldErrorClass}>{fieldErrors.guestPhone}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="specialRequests" className={shalomBookLabelClass}>
                Special requests <span className="font-normal normal-case">(optional)</span>
              </label>
              <textarea
                id="specialRequests"
                name="specialRequests"
                rows={4}
                value={form.specialRequests}
                onChange={(event) => updateField('specialRequests', event.target.value)}
                className={`${shalomBookFieldClass} resize-y`}
                placeholder="Late arrival, accessibility needs, etc."
              />
              {fieldErrors.specialRequests ? (
                <p className={shalomBookFieldErrorClass}>{fieldErrors.specialRequests}</p>
              ) : null}
            </div>

            <div className="space-y-3 rounded-xl border border-[color:var(--shalom-border)] bg-[color:var(--shalom-bg)]/60 p-4">
              <label className="flex items-start gap-3 text-sm text-[color:var(--shalom-text)]">
                <input
                  type="checkbox"
                  checked={form.acceptedTerms}
                  onChange={(event) => updateField('acceptedTerms', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[color:var(--shalom-border)] text-[color:var(--shalom-accent)]"
                />
                <span>
                  I agree to the{' '}
                  <Link
                    href={ECOMMERCE_POLICY_PATHS.terms}
                    className="font-semibold text-[color:var(--shalom-accent)] hover:underline"
                    target="_blank"
                  >
                    Terms &amp; Conditions
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.acceptedTerms ? (
                <p className={shalomBookFieldErrorClass}>{fieldErrors.acceptedTerms}</p>
              ) : null}

              <label className="flex items-start gap-3 text-sm text-[color:var(--shalom-text)]">
                <input
                  type="checkbox"
                  checked={form.acceptedCancellation}
                  onChange={(event) => updateField('acceptedCancellation', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[color:var(--shalom-border)] text-[color:var(--shalom-accent)]"
                />
                <span>
                  I understand the{' '}
                  <Link
                    href={ECOMMERCE_POLICY_PATHS.refund}
                    className="font-semibold text-[color:var(--shalom-accent)] hover:underline"
                    target="_blank"
                  >
                    cancellation and refund policy
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.acceptedCancellation ? (
                <p className={shalomBookFieldErrorClass}>{fieldErrors.acceptedCancellation}</p>
              ) : null}
            </div>
          </div>

          {fieldErrors.dates ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {fieldErrors.dates}
            </p>
          ) : null}

          {formError ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onBack}
              className={`${shalomPublicButtonGhostClass} sm:flex-1`}
              disabled={isPending}
            >
              Change dates
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={`${shalomPublicButtonPrimaryClass} sm:flex-[1.4] disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isPending ? 'Reserving your dates…' : 'Proceed to payment'}
            </button>
          </div>
        </form>

        <aside className={`mt-8 p-6 lg:mt-0 ${shalomPublicSurfaceClass}`}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--shalom-muted)]">
            Booking summary
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
          <Link
            href={shalomPublicHref(`/properties/${listing.slug}`)}
            className="mt-6 block text-center text-xs font-semibold text-[color:var(--shalom-accent)] hover:text-[color:var(--shalom-accent-hover)]"
          >
            Back to property
          </Link>
        </aside>
      </div>
    </div>
  );
}
