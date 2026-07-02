import { SHALOM_RESIDENCE_POLICY_SITE } from '../../../packages/ecommerce-policies';

import { DEFAULT_SHALOM_PUBLIC_CONTACT_PHONE } from './shalom-public-contact';

export type ShalomPublicWebsiteContent = {
  brandName: string;
  wordmarkTagline: string;
  heroEyebrow: string;
  heroTitlePrefix: string;
  heroTitleBrand: string;
  heroDescription: string;
  /** storage:// ref or public URL for optional hero background image */
  heroImageUrl: string;
  /** storage:// ref or public URL for header logo */
  logoImageUrl: string;
  propertiesSectionTitle: string;
  propertiesEmptyTitle: string;
  propertiesEmptyDescription: string;
  footerBlurb: string;
  contactPhone: string;
  contactEmail: string;
  contactIntro: string;
};

export const DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT: ShalomPublicWebsiteContent = {
  brandName: SHALOM_RESIDENCE_POLICY_SITE.businessName,
  wordmarkTagline: 'Direct stays · Secure booking',
  heroEyebrow: 'Shalom Residence',
  heroTitlePrefix: 'Find your stay at',
  heroTitleBrand: 'Shalom Residence',
  heroDescription:
    'Browse our collection of thoughtfully managed residences — book directly with clear policies and secure payment.',
  heroImageUrl: '',
  logoImageUrl: '',
  propertiesSectionTitle: 'Our properties',
  propertiesEmptyTitle: 'Stays coming soon',
  propertiesEmptyDescription:
    "We're putting the finishing touches on our guest listings. Please check back shortly, or reach out if you'd like to enquire about availability.",
  footerBlurb:
    'Thoughtfully managed short stays across our residence collection — book directly with clear policies and secure payment.',
  contactPhone: DEFAULT_SHALOM_PUBLIC_CONTACT_PHONE,
  contactEmail: SHALOM_RESIDENCE_POLICY_SITE.contactEmail,
  contactIntro:
    "Send us your details and message — we'll reply as soon as we can. You can also call or email us directly.",
};

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

export function mergeShalomPublicWebsiteContent(
  raw: Record<string, unknown> | null | undefined,
): ShalomPublicWebsiteContent {
  const source = raw ?? {};
  return {
    brandName: readString(source.brandName, DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.brandName),
    wordmarkTagline: readString(
      source.wordmarkTagline,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.wordmarkTagline,
    ),
    heroEyebrow: readString(source.heroEyebrow, DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.heroEyebrow),
    heroTitlePrefix: readString(
      source.heroTitlePrefix,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.heroTitlePrefix,
    ),
    heroTitleBrand: readString(
      source.heroTitleBrand,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.heroTitleBrand,
    ),
    heroDescription: readString(
      source.heroDescription,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.heroDescription,
    ),
    heroImageUrl: readString(source.heroImageUrl, ''),
    logoImageUrl: readString(source.logoImageUrl, ''),
    propertiesSectionTitle: readString(
      source.propertiesSectionTitle,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.propertiesSectionTitle,
    ),
    propertiesEmptyTitle: readString(
      source.propertiesEmptyTitle,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.propertiesEmptyTitle,
    ),
    propertiesEmptyDescription: readString(
      source.propertiesEmptyDescription,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.propertiesEmptyDescription,
    ),
    footerBlurb: readString(source.footerBlurb, DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.footerBlurb),
    contactPhone: readString(
      source.contactPhone,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.contactPhone,
    ),
    contactEmail: readString(
      source.contactEmail,
      DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.contactEmail,
    ),
    contactIntro: readString(source.contactIntro, DEFAULT_SHALOM_PUBLIC_WEBSITE_CONTENT.contactIntro),
  };
}
