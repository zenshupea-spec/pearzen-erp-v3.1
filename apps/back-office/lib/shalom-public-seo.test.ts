import { describe, expect, it } from 'vitest';

import {
  buildShalomListingPageMetadata,
  buildShalomPublicCanonicalUrl,
  buildShalomPublicPageMetadata,
  SHALOM_PUBLIC_SITE_NAME,
} from './shalom-public-seo';

describe('shalom-public-seo', () => {
  it('builds canonical urls for public paths', () => {
    expect(buildShalomPublicCanonicalUrl('/properties/ocean-villa')).toContain(
      '/properties/ocean-villa',
    );
  });

  it('builds listing metadata with og image', () => {
    const metadata = buildShalomListingPageMetadata({
      headline: 'Ocean Villa',
      description: 'A calm stay with garden views and fast Wi-Fi near Colombo.',
      slug: 'ocean-villa',
      heroImageUrl: 'https://cdn.example.com/hero.jpg',
    });

    expect(metadata.title).toBe('Ocean Villa');
    expect(metadata.openGraph?.images).toEqual([
      { url: 'https://cdn.example.com/hero.jpg', alt: 'Ocean Villa' },
    ]);
  });

  it('builds book flow metadata', () => {
    const metadata = buildShalomListingPageMetadata({
      headline: 'Ocean Villa',
      description: '',
      slug: 'ocean-villa',
      pageKind: 'book',
    });

    expect(metadata.title).toBe('Book Ocean Villa');
  });

  it('supports noindex pages', () => {
    const metadata = buildShalomPublicPageMetadata({
      title: 'Booking confirmation',
      path: '/confirmation/abc',
      robots: { index: false, follow: false },
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('uses Shalom Residence site name', () => {
    expect(SHALOM_PUBLIC_SITE_NAME).toBe('Shalom Residence');
  });
});
