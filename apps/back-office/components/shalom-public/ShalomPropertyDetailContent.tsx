import Link from 'next/link';
import { Bath, BedDouble, MapPin, Users } from 'lucide-react';

import ShalomPropertyBookingPanel from './ShalomPropertyBookingPanel';
import ShalomPropertyGallery from './ShalomPropertyGallery';
import { collectShalomPropertyGalleryImages } from './shalom-property-media';
import {
  shalomPublicButtonPrimaryClass,
  shalomPublicDisplayClass,
} from '../../lib/shalom-public-tokens';
import type {
  ShalomAvailabilityBooking,
  ShalomPublicListingView,
} from '../../lib/shalom-public-listings';
import { shalomPublicHref } from '../../lib/shalom-public-path';

export default function ShalomPropertyDetailContent({
  listing,
  bookings,
}: {
  listing: ShalomPublicListingView;
  bookings: ShalomAvailabilityBooking[];
}) {
  const title = listing.headline.trim() || listing.name;
  const galleryImages = collectShalomPropertyGalleryImages(listing);
  const bookHref = shalomPublicHref(`/book/${listing.slug}`);

  return (
    <>
      <ShalomPropertyGallery images={galleryImages} propertyName={title} />

      <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-12">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-12">
          <article className="min-w-0">
            <header>
              <p
                className={`text-xs font-bold uppercase tracking-[0.28em] text-[color:var(--shalom-accent)] ${shalomPublicDisplayClass}`}
              >
                Shalom Residence
              </p>
              <h1
                className={`mt-2 text-3xl font-semibold uppercase tracking-[0.08em] leading-tight text-[color:var(--shalom-text)] sm:text-4xl ${shalomPublicDisplayClass}`}
              >
                {title}
              </h1>
              {listing.headline.trim() && listing.name !== title ? (
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--shalom-muted)]">
                  {listing.name}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--shalom-muted)]">
                {listing.location ? (
                  <p className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-[color:var(--shalom-accent)]" aria-hidden />
                    {listing.location}
                  </p>
                ) : null}
                {listing.bedrooms > 0 ? (
                  <p className="inline-flex items-center gap-1.5">
                    <BedDouble className="h-4 w-4 text-[color:var(--shalom-accent)]" aria-hidden />
                    {listing.bedrooms} {listing.bedrooms === 1 ? 'bedroom' : 'bedrooms'}
                  </p>
                ) : null}
                {listing.bathrooms > 0 ? (
                  <p className="inline-flex items-center gap-1.5">
                    <Bath className="h-4 w-4 text-[color:var(--shalom-accent)]" aria-hidden />
                    {listing.bathrooms} {listing.bathrooms === 1 ? 'bathroom' : 'bathrooms'}
                  </p>
                ) : null}
                <p className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-[color:var(--shalom-accent)]" aria-hidden />
                  Up to {listing.maxGuests} {listing.maxGuests === 1 ? 'guest' : 'guests'}
                </p>
              </div>
            </header>

            {listing.description.trim() ? (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-[color:var(--shalom-text)]">About this stay</h2>
                <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[color:var(--shalom-muted)]">
                  {listing.description.trim()}
                </div>
              </section>
            ) : null}

            {listing.amenities.length > 0 ? (
              <section className="mt-8">
                <h2 className="text-lg font-semibold text-[color:var(--shalom-text)]">Amenities</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {listing.amenities.map((amenity) => (
                    <li
                      key={amenity}
                      className="rounded-full border border-[color:var(--shalom-border)] bg-[color:var(--shalom-accent-soft)]/60 px-3 py-1.5 text-xs font-semibold text-[color:var(--shalom-text)]"
                    >
                      {amenity}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="mt-10 lg:hidden">
              <ShalomPropertyBookingPanel listing={listing} bookings={bookings} layout="inline" />
            </div>
          </article>

          <div className="hidden lg:block">
            <div className="sticky top-24">
              <ShalomPropertyBookingPanel listing={listing} bookings={bookings} />
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--shalom-border)] bg-[color:var(--shalom-surface)]/95 p-4 backdrop-blur-md lg:hidden">
        <Link href={bookHref} className={`${shalomPublicButtonPrimaryClass} w-full`}>
          Check availability
        </Link>
      </div>

      <div className="h-20 lg:hidden" aria-hidden />
    </>
  );
}
