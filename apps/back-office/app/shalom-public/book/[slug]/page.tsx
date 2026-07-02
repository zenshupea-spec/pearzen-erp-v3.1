import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import ShalomBookFlow from '../../../../components/shalom-public/ShalomBookFlow';
import { fetchPublishedListingWithAvailability } from '../../../../lib/shalom-public-data';
import { validateShalomPublicSlug } from '../../../../lib/shalom-public-listings';
import { buildShalomListingPageMetadata, buildShalomPublicPageMetadata } from '../../../../lib/shalom-public-seo';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    checkIn?: string;
    checkOut?: string;
    guests?: string;
    arrivalTime?: string;
    payment?: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchPublishedListingWithAvailability(slug);

  if (!data) {
    return buildShalomPublicPageMetadata({
      title: 'Booking not found',
      path: `/book/${slug}`,
      robots: { index: false, follow: false },
    });
  }

  const title = data.listing.headline.trim() || data.listing.name;
  return buildShalomListingPageMetadata({
    headline: title,
    description: data.listing.description,
    slug: data.listing.slug,
    heroImageUrl: data.listing.heroImagePublicUrl,
    pageKind: 'book',
  });
}

export default async function ShalomBookPropertyPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  if (validateShalomPublicSlug(slug)) {
    notFound();
  }

  const data = await fetchPublishedListingWithAvailability(slug);
  if (!data) {
    notFound();
  }

  const initialCheckIn =
    typeof query.checkIn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.checkIn)
      ? query.checkIn
      : undefined;
  const initialCheckOut =
    typeof query.checkOut === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.checkOut)
      ? query.checkOut
      : undefined;

  const paymentCancelled = query.payment === 'cancelled';
  const parsedGuests = Number(query.guests);
  const initialGuestCount =
    Number.isFinite(parsedGuests) && parsedGuests > 0 ? Math.round(parsedGuests) : undefined;
  const initialArrivalTime =
    typeof query.arrivalTime === 'string' && /^\d{2}:\d{2}$/.test(query.arrivalTime)
      ? query.arrivalTime
      : undefined;

  return (
    <ShalomBookFlow
      listing={data.listing}
      bookings={data.bookings}
      initialCheckIn={initialCheckIn}
      initialCheckOut={initialCheckOut}
      initialGuestCount={initialGuestCount}
      initialArrivalTime={initialArrivalTime}
      paymentCancelled={paymentCancelled}
    />
  );
}
