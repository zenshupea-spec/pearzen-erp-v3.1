/** Tenant public website content — landing, menu link card, and site registry types. */

export const TENANT_PUBLIC_SITE_TYPES = [
  'security_marketing',
  'landing',
  'menu',
] as const;

export type TenantPublicSiteType = (typeof TENANT_PUBLIC_SITE_TYPES)[number];

export type TenantPublicSiteRecord = {
  id: string;
  companyId: string;
  siteType: TenantPublicSiteType;
  hostname: string | null;
  contentJson: Record<string, unknown>;
  publishedAt: string | null;
  updatedAt: string;
};

export type TenantLandingProduct = {
  id: string;
  name: string;
  description: string;
  priceLkr: number;
  imageUrl: string | null;
  isActive: boolean;
};

export type TenantLandingWebsiteContent = {
  companyName: string;
  tagline: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroCtaLabel: string;
  heroCtaHref: string;
  heroImageUrl: string | null;
  aboutTitle: string;
  aboutBody: string;
  contactEmail: string;
  contactPhone: string;
  products: TenantLandingProduct[];
};

export type TenantMenuWebsiteContent = {
  title: string;
  tagline: string;
  menuUrl: string;
  notice: string;
};

export const DEFAULT_TENANT_LANDING_CONTENT: TenantLandingWebsiteContent = {
  companyName: 'Your company',
  tagline: 'Welcome',
  heroHeadline: 'Professional services you can trust',
  heroSubheadline:
    'Update this landing page from Settings → Public website. Publish when DNS and copy are ready.',
  heroCtaLabel: 'Contact us',
  heroCtaHref: 'mailto:hello@example.com',
  heroImageUrl: null,
  aboutTitle: 'About us',
  aboutBody:
    'Tell visitors who you are, what you do, and why clients choose you. This section supports plain text for now.',
  contactEmail: 'hello@example.com',
  contactPhone: '+94 11 000 0000',
  products: [],
};

export const DEFAULT_TENANT_MENU_CONTENT: TenantMenuWebsiteContent = {
  title: 'Customer menu',
  tagline: 'Order online from our café',
  menuUrl: 'https://tasha.lk',
  notice: 'Point your menu custom domain at the client PWA deploy, then publish this link card.',
};

export function isTenantPublicSiteType(value: string): value is TenantPublicSiteType {
  return (TENANT_PUBLIC_SITE_TYPES as readonly string[]).includes(value);
}

export function tenantPublicSiteTypeLabel(siteType: TenantPublicSiteType): string {
  switch (siteType) {
    case 'security_marketing':
      return 'Security marketing site';
    case 'landing':
      return 'Landing page';
    case 'menu':
      return 'Customer menu link';
    default:
      return siteType;
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function mergeTenantLandingProducts(raw: unknown): TenantLandingProduct[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = asString(row.id, '');
      if (!id) return null;

      return {
        id,
        name: asString(row.name, 'Product'),
        description: asString(row.description, ''),
        priceLkr: asNumber(row.priceLkr, 0),
        imageUrl: asNullableString(row.imageUrl),
        isActive: row.isActive !== false,
      } satisfies TenantLandingProduct;
    })
    .filter((row): row is TenantLandingProduct => row != null);
}

export function createTenantLandingProduct(
  partial?: Partial<TenantLandingProduct>,
): TenantLandingProduct {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    name: partial?.name ?? 'New product',
    description: partial?.description ?? '',
    priceLkr: partial?.priceLkr ?? 0,
    imageUrl: partial?.imageUrl ?? null,
    isActive: partial?.isActive !== false,
  };
}

export function mergeTenantLandingContent(raw: unknown): TenantLandingWebsiteContent {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const defaults = DEFAULT_TENANT_LANDING_CONTENT;
  return {
    companyName: asString(input.companyName, defaults.companyName),
    tagline: asString(input.tagline, defaults.tagline),
    heroHeadline: asString(input.heroHeadline, defaults.heroHeadline),
    heroSubheadline: asString(input.heroSubheadline, defaults.heroSubheadline),
    heroCtaLabel: asString(input.heroCtaLabel, defaults.heroCtaLabel),
    heroCtaHref: asString(input.heroCtaHref, defaults.heroCtaHref),
    heroImageUrl: asNullableString(input.heroImageUrl),
    aboutTitle: asString(input.aboutTitle, defaults.aboutTitle),
    aboutBody: asString(input.aboutBody, defaults.aboutBody),
    contactEmail: asString(input.contactEmail, defaults.contactEmail),
    contactPhone: asString(input.contactPhone, defaults.contactPhone),
    products: mergeTenantLandingProducts(input.products),
  };
}

export function mergeTenantMenuContent(raw: unknown): TenantMenuWebsiteContent {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const defaults = DEFAULT_TENANT_MENU_CONTENT;
  return {
    title: asString(input.title, defaults.title),
    tagline: asString(input.tagline, defaults.tagline),
    menuUrl: asString(input.menuUrl, defaults.menuUrl),
    notice: asString(input.notice, defaults.notice),
  };
}
