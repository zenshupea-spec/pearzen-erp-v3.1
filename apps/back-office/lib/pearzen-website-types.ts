export type PearzenWebsiteStat = {
  value: string;
  label: string;
  actionLabel: string;
  actionHref: string;
};

export type PearzenWebsiteCard = {
  title: string;
  description: string;
  href?: string;
  external?: boolean;
};

export type PearzenWebsiteContent = {
  companyName: string;
  tagline: string;
  logoUrl: string | null;
  heroHeadline: string;
  heroSubheadline: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  heroVideoFocalX: number;
  heroVideoFocalY: number;
  heroVideoScale: number;
  heroVideoColumn: 'left' | 'right';
  stats: PearzenWebsiteStat[];
  platformTitle: string;
  platformBody: string;
  platformBullets: string[];
  productsTitle: string;
  products: PearzenWebsiteCard[];
  industriesTitle: string;
  industries: PearzenWebsiteCard[];
  contactHeadline: string;
  contactBody: string;
  contactEmail: string;
};

export const PEARZEN_WEBSITE_STAT_COUNT = 4;
export const PEARZEN_WEBSITE_PRODUCT_COUNT = 4;
export const PEARZEN_WEBSITE_INDUSTRY_COUNT = 3;
export const PEARZEN_WEBSITE_PLATFORM_BULLET_COUNT = 4;

export const DEFAULT_PEARZEN_WEBSITE_CONTENT: PearzenWebsiteContent = {
  companyName: 'Pearzen Technologies',
  tagline: 'Software across markets',
  logoUrl: '/pearzen-website/pearzen-wordmark.png',
  heroHeadline: 'Building software that moves work, commerce, and communities.',
  heroSubheadline:
    'Workforce and hospitality tools, bespoke internal software, client website building, and a super app for social, commerce, and discovery — engineered on one shared platform.',
  heroCtaPrimary: 'Talk to us',
  heroCtaSecondary: 'How we build',
  heroVideoFocalX: 58,
  heroVideoFocalY: 50,
  heroVideoScale: 1.08,
  heroVideoColumn: 'left',
  stats: [
    {
      value: 'WFM',
      label: 'Workforce & hospitality',
      actionLabel: '',
      actionHref: '',
    },
    {
      value: 'Custom',
      label: 'Internal software builds',
      actionLabel: '',
      actionHref: '',
    },
    {
      value: 'Websites',
      label: 'Website building & hosting',
      actionLabel: '',
      actionHref: '',
    },
    {
      value: 'Super App',
      label: 'Social & marketplace',
      actionLabel: '',
      actionHref: '',
    },
  ],
  platformTitle: 'One team behind every product line',
  platformBody:
    'Four product lines — workforce, bespoke software, client sites, and consumer apps — built by one engineering practice. We share the same stack, security model, and release discipline across every deployment.',
  platformBullets: [
    'Multi-tenant workforce software with GPS geofence proof, payroll, rostering, and café operations for distributed teams.',
    'Bespoke portals and internal modules on our core platform — scoped to your workflows instead of generic SaaS boxes.',
    'Client marketing sites and branded domains — designed, deployed, and optionally hosted on our infrastructure.',
    'Consumer-scale social, marketplace, rides, jobs, and local discovery — unified in one app with trusted identity.',
  ],
  productsTitle: 'What we build',
  products: [
    {
      title: 'WFM tool',
      description:
        'Payroll, GPS-verified attendance, and rostering for distributed teams — plus café and restaurant management for high-turnover hospitality operations.',
    },
    {
      title: 'Custom internal software',
      description:
        'Bespoke portals, ERP modules, and integrations engineered on our stack — shaped around your workflows instead of generic SaaS boxes.',
    },
    {
      title: 'Website building',
      description:
        'Client marketing sites, security company homepages, and customer-menu domains — designed, deployed, and optionally hosted on our stack.',
    },
    {
      title: 'Super app',
      description:
        'Social media, marketplace, trusted ridesharing with people you know, job search, marriage matching, and ranked local guides — unified in one app.',
    },
  ],
  industriesTitle: 'Where we focus',
  industries: [
    {
      title: 'Security & hospitality',
      description:
        'Manpower providers and F&B operators running hundreds of sites — live proof, payroll, and client transparency.',
    },
    {
      title: 'Enterprise operations',
      description:
        'Multi-site businesses that need tenant-isolated portals, finance, HR, and field compliance in one deployment.',
    },
    {
      title: 'Consumer communities',
      description:
        'Trusted networks for rides, jobs, relationships, and local discovery — designed for real connections, not anonymous marketplaces.',
    },
  ],
  contactHeadline: 'Ready to build with Pearzen?',
  contactBody:
    'Whether you are scoping a workforce deployment, commissioning internal software, launching a client website, or partnering on the super app — tell us what you are building and we will take it from there.',
  contactEmail: 'info@pearzen.tech',
};

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asHeroVideoColumn(value: unknown, fallback: 'left' | 'right'): 'left' | 'right' {
  return value === 'right' ? 'right' : fallback;
}

const LEGACY_PEARZEN_LOGO_URL = '/pearzen-website/pearzen-technologies-logo.png';

function normalizePearzenLogoUrl(value: string | null, fallback: string | null): string | null {
  if (!value) return fallback;
  if (value === LEGACY_PEARZEN_LOGO_URL) {
    return DEFAULT_PEARZEN_WEBSITE_CONTENT.logoUrl;
  }
  return value;
}

function mergeStats(raw: unknown, defaults: PearzenWebsiteStat[]): PearzenWebsiteStat[] {
  const list = Array.isArray(raw) ? raw : [];
  return defaults.slice(0, PEARZEN_WEBSITE_STAT_COUNT).map((fallback, index) => {
    const item =
      list[index] && typeof list[index] === 'object' && !Array.isArray(list[index])
        ? (list[index] as Record<string, unknown>)
        : {};
    return {
      value: asString(item.value, fallback.value),
      label: asString(item.label, fallback.label),
      actionLabel: asString(item.actionLabel, fallback.actionLabel),
      actionHref: asString(item.actionHref, fallback.actionHref),
    };
  });
}

function mergeList<T extends Record<string, string>>(
  raw: unknown,
  defaults: T[],
  count: number,
  fields: (keyof T)[],
): T[] {
  const list = Array.isArray(raw) ? raw : [];
  return defaults.slice(0, count).map((fallback, index) => {
    const item =
      list[index] && typeof list[index] === 'object' && !Array.isArray(list[index])
        ? (list[index] as Record<string, unknown>)
        : {};
    const merged = { ...fallback };
    for (const field of fields) {
      const key = String(field);
      merged[field] = asString(item[key], String(fallback[field])) as T[keyof T];
    }
    const href = asNullableString(item.href);
    if (href) (merged as PearzenWebsiteCard).href = href;
    if (typeof item.external === 'boolean') {
      (merged as PearzenWebsiteCard).external = item.external;
    }
    return merged;
  });
}

function alignContentList<T>(filtered: T[], defaults: T[], count: number): T[] {
  const result = filtered.slice(0, count);
  while (result.length < count) {
    result.push(defaults[result.length]);
  }
  return result;
}

function isRetiredFundStat(stat: PearzenWebsiteStat): boolean {
  return (
    stat.value.trim().toLowerCase() === 'fund' ||
    /\balgorithmic\b/i.test(stat.label) ||
    /\btrading\b/i.test(stat.label)
  );
}

function isRetiredFundProduct(card: PearzenWebsiteCard): boolean {
  return (
    /\b(algorithmic|trading fund)\b/i.test(card.title) ||
    /\bqualified investors\b/i.test(card.description)
  );
}

function isRetiredFundIndustry(card: PearzenWebsiteCard): boolean {
  return /\bquantitative finance\b/i.test(card.title);
}

function isRetiredFundBullet(text: string): boolean {
  return /\b(systematic research|qualified capital|auditable deployment of qualified capital)\b/i.test(
    text,
  );
}

function stripRetiredFundContent(content: PearzenWebsiteContent): PearzenWebsiteContent {
  const defaults = DEFAULT_PEARZEN_WEBSITE_CONTENT;

  return {
    ...content,
    heroSubheadline: /\b(five product lines|algorithmic trading)\b/i.test(content.heroSubheadline)
      ? defaults.heroSubheadline
      : content.heroSubheadline,
    heroCtaSecondary:
      /^explore products$/i.test(content.heroCtaSecondary.trim())
        ? defaults.heroCtaSecondary
        : content.heroCtaSecondary,
    stats: alignContentList(
      content.stats.filter((stat) => !isRetiredFundStat(stat)),
      defaults.stats,
      PEARZEN_WEBSITE_STAT_COUNT,
    ),
    platformBody:
      /\b(four pillars above|five pillars above|capital infrastructure)\b/i.test(content.platformBody)
        ? defaults.platformBody
        : content.platformBody,
    platformBullets: alignContentList(
      content.platformBullets.filter((bullet) => !isRetiredFundBullet(bullet)),
      defaults.platformBullets,
      PEARZEN_WEBSITE_PLATFORM_BULLET_COUNT,
    ),
    products: alignContentList(
      content.products.filter((product) => !isRetiredFundProduct(product)),
      defaults.products,
      PEARZEN_WEBSITE_PRODUCT_COUNT,
    ),
    industries: alignContentList(
      content.industries.filter((industry) => !isRetiredFundIndustry(industry)),
      defaults.industries,
      PEARZEN_WEBSITE_INDUSTRY_COUNT,
    ),
    contactBody: /\bcapital partnerships\b/i.test(content.contactBody)
      ? defaults.contactBody
      : content.contactBody,
  };
}

export function mergePearzenWebsiteContent(raw: unknown): PearzenWebsiteContent {
  const data =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const defaults = DEFAULT_PEARZEN_WEBSITE_CONTENT;

  const merged: PearzenWebsiteContent = {
    companyName: asString(data.companyName, defaults.companyName),
    tagline: asString(data.tagline, defaults.tagline),
    logoUrl: normalizePearzenLogoUrl(
      asNullableString(data.logoUrl),
      defaults.logoUrl,
    ),
    heroHeadline: asString(data.heroHeadline, defaults.heroHeadline),
    heroSubheadline: asString(data.heroSubheadline, defaults.heroSubheadline),
    heroCtaPrimary: asString(data.heroCtaPrimary, defaults.heroCtaPrimary),
    heroCtaSecondary: asString(data.heroCtaSecondary, defaults.heroCtaSecondary),
    heroVideoFocalX: asNumber(data.heroVideoFocalX, defaults.heroVideoFocalX, 0, 100),
    heroVideoFocalY: asNumber(data.heroVideoFocalY, defaults.heroVideoFocalY, 0, 100),
    heroVideoScale: asNumber(data.heroVideoScale, defaults.heroVideoScale, 1, 2),
    heroVideoColumn: asHeroVideoColumn(data.heroVideoColumn, defaults.heroVideoColumn),
    stats: mergeStats(data.stats, defaults.stats),
    platformTitle: asString(data.platformTitle, defaults.platformTitle),
    platformBody: asString(data.platformBody, defaults.platformBody),
    platformBullets: mergeList(
      (data.platformBullets as unknown[])?.map((b) => ({ text: String(b ?? '') })) ??
        defaults.platformBullets.map((text) => ({ text })),
      defaults.platformBullets.map((text) => ({ text })),
      PEARZEN_WEBSITE_PLATFORM_BULLET_COUNT,
      ['text'],
    ).map((row) => row.text),
    productsTitle: asString(data.productsTitle, defaults.productsTitle),
    products: mergeList(
      data.products,
      defaults.products,
      PEARZEN_WEBSITE_PRODUCT_COUNT,
      ['title', 'description'],
    ),
    industriesTitle: asString(data.industriesTitle, defaults.industriesTitle),
    industries: mergeList(
      data.industries,
      defaults.industries,
      PEARZEN_WEBSITE_INDUSTRY_COUNT,
      ['title', 'description'],
    ),
    contactHeadline: asString(data.contactHeadline, defaults.contactHeadline),
    contactBody: asString(data.contactBody, defaults.contactBody),
    contactEmail: asString(data.contactEmail, defaults.contactEmail),
  };

  return stripRetiredFundContent(merged);
}
