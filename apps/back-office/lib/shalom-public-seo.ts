import type { Metadata } from 'next';

import { SHALOM_RESIDENCE_POLICY_SITE } from '../../../packages/ecommerce-policies';

import { resolveShalomPublicSiteBaseUrl } from './shalom-public-payhere';
import { shalomPublicHref } from './shalom-public-path';

export const SHALOM_PUBLIC_SITE_NAME = SHALOM_RESIDENCE_POLICY_SITE.businessName;

export const SHALOM_PUBLIC_DEFAULT_DESCRIPTION =
  'Browse and book short stays at Shalom Residence — warm hospitality, clear policies, and secure payment.';

export const SHALOM_PUBLIC_NOINDEX_ROBOTS: Metadata['robots'] = {
  index: false,
  follow: false,
};

export function resolveShalomPublicMetadataBase(): URL {
  try {
    return new URL(resolveShalomPublicSiteBaseUrl());
  } catch {
    return new URL(SHALOM_RESIDENCE_POLICY_SITE.websiteUrl);
  }
}

export function buildShalomPublicCanonicalUrl(path = '/'): string {
  const metadataBase = resolveShalomPublicMetadataBase();
  return new URL(shalomPublicHref(path), metadataBase).toString();
}

export function buildShalomPublicPageMetadata(input: {
  title: string;
  description?: string;
  path?: string;
  ogImageUrl?: string | null;
  robots?: Metadata['robots'];
}): Metadata {
  const title = input.title.trim();
  const description = input.description?.trim() || SHALOM_PUBLIC_DEFAULT_DESCRIPTION;
  const canonical = buildShalomPublicCanonicalUrl(input.path ?? '/');
  const imageUrl = input.ogImageUrl?.trim() || null;
  const images = imageUrl ? [{ url: imageUrl, alt: title }] : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      siteName: SHALOM_PUBLIC_SITE_NAME,
      type: 'website',
      locale: 'en_LK',
      url: canonical,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
    ...(input.robots ? { robots: input.robots } : {}),
  };
}

export const shalomPublicRootMetadata: Metadata = {
  metadataBase: resolveShalomPublicMetadataBase(),
  title: {
    default: `Find your stay — ${SHALOM_PUBLIC_SITE_NAME}`,
    template: `%s — ${SHALOM_PUBLIC_SITE_NAME}`,
  },
  description: SHALOM_PUBLIC_DEFAULT_DESCRIPTION,
  applicationName: SHALOM_PUBLIC_SITE_NAME,
  openGraph: {
    siteName: SHALOM_PUBLIC_SITE_NAME,
    type: 'website',
    locale: 'en_LK',
    title: `Find your stay — ${SHALOM_PUBLIC_SITE_NAME}`,
    description: SHALOM_PUBLIC_DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: `Find your stay — ${SHALOM_PUBLIC_SITE_NAME}`,
    description: SHALOM_PUBLIC_DEFAULT_DESCRIPTION,
  },
};

export function buildShalomListingPageMetadata(input: {
  headline: string;
  description: string;
  slug: string;
  heroImageUrl?: string | null;
  pageKind?: 'property' | 'book';
}): Metadata {
  const headline = input.headline.trim() || 'Shalom stay';
  const title =
    input.pageKind === 'book' ? `Book ${headline}` : headline;
  const description =
    input.description.trim().slice(0, 160) ||
    (input.pageKind === 'book'
      ? `Choose dates and book ${headline} directly at Shalom Residence.`
      : `Book ${headline} at Shalom Residence — direct stays with secure payment.`);

  const path =
    input.pageKind === 'book'
      ? `/book/${input.slug}`
      : `/properties/${input.slug}`;

  return buildShalomPublicPageMetadata({
    title,
    description,
    path,
    ogImageUrl: input.heroImageUrl,
    robots: input.pageKind === 'book' ? { index: false, follow: true } : undefined,
  });
}
