import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import ShalomPropertyDetailContent from '../../../../components/shalom-public/ShalomPropertyDetailContent';
import { fetchPublishedListingWithAvailability } from '../../../../lib/shalom-public-data';
import { validateShalomPublicSlug } from '../../../../lib/shalom-public-listings';
import { buildShalomListingPageMetadata, buildShalomPublicPageMetadata } from '../../../../lib/shalom-public-seo';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchPublishedListingWithAvailability(slug);

  if (!data) {
    return buildShalomPublicPageMetadata({
      title: 'Property not found',
      path: `/properties/${slug}`,
    });
  }

  const title = data.listing.headline.trim() || data.listing.name;

  return buildShalomListingPageMetadata({
    headline: title,
    description: data.listing.description,
    slug: data.listing.slug,
    heroImageUrl: data.listing.heroImagePublicUrl,
  });
}

export default async function ShalomPropertyDetailPage({ params }: PageProps) {
  const { slug } = await params;

  if (validateShalomPublicSlug(slug)) {
    notFound();
  }

  const data = await fetchPublishedListingWithAvailability(slug);
  if (!data) {
    notFound();
  }

  return <ShalomPropertyDetailContent listing={data.listing} bookings={data.bookings} />;
}
