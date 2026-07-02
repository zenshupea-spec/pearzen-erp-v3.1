'use client';

import Image from 'next/image';
import Link from 'next/link';
import { BedDouble, MapPin, Users } from 'lucide-react';

import {
  formatShalomPublicLkr,
  type ShalomPublicListingView,
} from '../../lib/shalom-public-listings';
import { shalomPublicDisplayClass, shalomPublicSurfaceClass } from '../../lib/shalom-public-tokens';
import { useShalomPublicHref } from './useShalomPublicHref';

function resolveCardImageUrl(listing: ShalomPublicListingView): string | null {
  if (listing.heroImagePublicUrl) return listing.heroImagePublicUrl;
  const firstGallery = listing.galleryPhotos.find((photo) => photo.publicUrl);
  return firstGallery?.publicUrl ?? null;
}

export default function ShalomPropertyCard({ listing }: { listing: ShalomPublicListingView }) {
  const href = useShalomPublicHref();
  const imageUrl = resolveCardImageUrl(listing);
  const title = listing.headline.trim() || listing.name;
  const propertyHref = href(`/properties/${listing.slug}`);

  return (
    <Link
      href={propertyHref}
      className={`group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-32px_rgba(13,148,136,0.45)] ${shalomPublicSurfaceClass}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[color:var(--shalom-accent-soft)]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[color:var(--shalom-accent)]/40">
            <BedDouble className="h-12 w-12" aria-hidden />
          </div>
        )}
      </div>

      <div className="space-y-2 p-5">
        <div>
          <h2
            className={`text-xl font-semibold uppercase tracking-[0.1em] leading-snug text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
          >
            {title}
          </h2>
          {listing.headline.trim() && listing.name !== title ? (
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--shalom-muted)]">
              {listing.name}
            </p>
          ) : null}
        </div>

        {listing.location ? (
          <p className="flex items-start gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--shalom-muted)]">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--shalom-accent)]" aria-hidden />
            <span>{listing.location}</span>
          </p>
        ) : null}

        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--shalom-muted)]">
          <Users className="h-3.5 w-3.5 text-[color:var(--shalom-accent)]" aria-hidden />
          Up to {listing.maxGuests} {listing.maxGuests === 1 ? 'guest' : 'guests'}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-sm font-semibold text-[color:var(--shalom-accent)]">
            From {formatShalomPublicLkr(listing.nightlyRateLkr)}
            <span className="font-normal text-[color:var(--shalom-muted)]"> / night</span>
          </p>
          {listing.bedrooms > 0 ? (
            <p className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--shalom-muted)]">
              <BedDouble className="h-3.5 w-3.5" aria-hidden />
              {listing.bedrooms} {listing.bedrooms === 1 ? 'bedroom' : 'bedrooms'}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
