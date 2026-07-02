import {
  DEFAULT_INDUSTRY_DETAILS,
  DEFAULT_SERVICE_DETAILS,
  SECURITY_INDUSTRY_SLUGS,
  SECURITY_SERVICE_SLUGS,
  type SecurityIndustrySlug,
  type SecurityServiceSlug,
} from './security-website-catalog';
import type { LocalizedHero, SecurityWebsiteLocale } from './security-website-i18n';
import {
  mergeImageFrames,
  type SecurityWebsiteImageFrames,
} from './security-website-image-frame';
import {
  CV_BROCHURE_ASSETS,
  CV_BROCHURE_CLIENTS,
  CV_BROCHURE_CLIENT_LOGOS,
  DEPRECATED_SECURITY_WEBSITE_CLIENTS,
  resolveSecurityWebsiteClientLogo,
} from './security-website-brand';
import { stripImageCacheBuster } from './security-website-image-utils';

export type SecurityWebsiteStat = {
  value: string;
  label: string;
};

export type SecurityWebsiteService = {
  title: string;
  description: string;
  slug?: string;
};

export type SecurityWebsiteTechFeature = {
  title: string;
  description: string;
};

export type SecurityWebsiteFaq = {
  question: string;
  answer: string;
};

export type SecurityWebsiteTestimonial = {
  quote: string;
  author: string;
  role: string;
  industry: string;
};

export type SecurityWebsiteServiceDetail = {
  slug: string;
  title: string;
  description: string;
  whoItsFor: string;
  included: string;
  shiftPatterns: string;
  faq: SecurityWebsiteFaq[];
};

export type SecurityWebsiteIndustryDetail = {
  slug: string;
  title: string;
  description: string;
  risks: string;
  typicalDeployment: string;
  complianceNotes: string;
  recommendedServiceSlug: string;
};

export type SecurityWebsiteRankClientRate = {
  rankCode: string;
  clientRatePerShift: number;
};

export type SecurityWebsiteClient = {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Marquee logo scale multiplier (1 = default). */
  logoZoom?: number;
};

export type SecurityWebsiteTrainingGalleryImage = {
  id: string;
  url: string;
};

export const SECURITY_WEBSITE_HERO_TRAINING_GALLERY_MAX = 40;

export type SecurityWebsiteRateCard = {
  baseRatePerGuardHour: number;
  shiftMultipliers: { h8: number; h12: number; h24: number };
  locationMultipliers: { colombo: number; greaterColombo: number; other: number };
  serviceMultipliers: { static: number; patrol: number; corporate: number; event: number };
  supervisorMonthlyFee: number;
  armedPremiumPerGuardMonthly: number;
  contractDiscounts: { m1: number; m6: number; m12: number };
  daysPerMonth: number;
  rankLowMultiplier: number;
  rankHighMultiplier: number;
  /** Client billing rate per shift by guard rank (from MD rank matrix). */
  rankClientRates: SecurityWebsiteRankClientRate[];
};

export type SecurityWebsiteCompliance = {
  siraRegistrationNumber: string;
  siraValidUntil: string;
  insuranceSummary: string;
  replacementHours: string;
  trainingHours: string;
  companyRegistration: string;
  epfCompliant: boolean;
};

export type SecurityWebsiteContent = {
  companyName: string;
  tagline: string;
  logoUrl: string | null;
  heroHeadline: string;
  heroSubheadline: string;
  heroImageUrl: string | null;
  heroTrainingGallery: SecurityWebsiteTrainingGalleryImage[];
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  stats: SecurityWebsiteStat[];
  servicesTitle: string;
  servicesSubtitle: string;
  services: SecurityWebsiteService[];
  techTitle: string;
  techSubtitle: string;
  techImageUrl: string | null;
  techFeatures: SecurityWebsiteTechFeature[];
  techBody: string;
  aboutTitle: string;
  aboutBody: string;
  aboutImageUrl: string | null;
  timelineCoverageImageUrl: string | null;
  timelineMonitoringImageUrl: string | null;
  ctaHeadline: string;
  ctaBody: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  contactEmergencyPhone: string;
  whatsappNumber: string;
  footerTagline: string;
  rateCard: SecurityWebsiteRateCard;
  compliance: SecurityWebsiteCompliance;
  serviceDetails: SecurityWebsiteServiceDetail[];
  industryDetails: SecurityWebsiteIndustryDetail[];
  testimonials: SecurityWebsiteTestimonial[];
  faq: SecurityWebsiteFaq[];
  clientsTitle: string;
  clientsSubtitle: string;
  clients: SecurityWebsiteClient[];
  i18n: Partial<Record<SecurityWebsiteLocale, LocalizedHero>>;
  opsNotificationEmail: string;
  imageFrames: SecurityWebsiteImageFrames;
};

export const SECURITY_WEBSITE_STAT_COUNT = 4;
export const SECURITY_WEBSITE_SERVICE_COUNT = 4;
export const SECURITY_WEBSITE_TECH_COUNT = 4;
export const SECURITY_WEBSITE_TESTIMONIAL_COUNT = 3;
export const SECURITY_WEBSITE_FAQ_COUNT = 5;

export const DEFAULT_SECURITY_WEBSITE_RANK_CLIENT_RATES: SecurityWebsiteRankClientRate[] = [
  { rankCode: 'CSO', clientRatePerShift: 2800 },
  { rankCode: 'OIC', clientRatePerShift: 2600 },
  { rankCode: 'SSO', clientRatePerShift: 2400 },
  { rankCode: 'JSO', clientRatePerShift: 2200 },
  { rankCode: 'LSO', clientRatePerShift: 2200 },
];

function buildDefaultClients(): SecurityWebsiteClient[] {
  return CV_BROCHURE_CLIENTS.map((name, index) => ({
    id: `client-${index + 1}`,
    name,
    logoUrl: CV_BROCHURE_CLIENT_LOGOS[name] ?? null,
  }));
}

const HERO_TRAINING_GALLERY_POOL = [
  CV_BROCHURE_ASSETS.trainingParade,
  CV_BROCHURE_ASSETS.trainingFirstAid,
  CV_BROCHURE_ASSETS.about,
  CV_BROCHURE_ASSETS.warriors,
  CV_BROCHURE_ASSETS.hero,
  CV_BROCHURE_ASSETS.staticGuard,
] as const;

function buildDefaultHeroTrainingGallery(): SecurityWebsiteTrainingGalleryImage[] {
  return Array.from({ length: 12 }, (_, index) => ({
    id: `default-training-${index + 1}`,
    url: HERO_TRAINING_GALLERY_POOL[index % HERO_TRAINING_GALLERY_POOL.length],
  }));
}

export const DEFAULT_SECURITY_WEBSITE_RATE_CARD: SecurityWebsiteRateCard = {
  baseRatePerGuardHour: 450,
  shiftMultipliers: { h8: 1, h12: 1.35, h24: 2.2 },
  locationMultipliers: { colombo: 1, greaterColombo: 0.95, other: 1.1 },
  serviceMultipliers: { static: 1, patrol: 1.15, corporate: 1.05, event: 1.25 },
  supervisorMonthlyFee: 85000,
  armedPremiumPerGuardMonthly: 25000,
  contractDiscounts: { m1: 1, m6: 0.98, m12: 0.95 },
  daysPerMonth: 30,
  rankLowMultiplier: 0.92,
  rankHighMultiplier: 1.08,
  rankClientRates: DEFAULT_SECURITY_WEBSITE_RANK_CLIENT_RATES,
};

export const DEFAULT_SECURITY_WEBSITE_COMPLIANCE: SecurityWebsiteCompliance = {
  siraRegistrationNumber: 'Ministry of Defence — Certificate of Registration & Annual License',
  siraValidUntil: 'Annual license renewed',
  insuranceSummary:
    'Registered with Registrar General of Companies; EPF & ETF compliant; Fire Service Department approved for extinguishers.',
  replacementHours: '4',
  trainingHours: '40+',
  companyRegistration: 'Classic Venture Security (Pvt) Ltd. — established 7 March 2006',
  epfCompliant: true,
};

function buildDefaultServiceDetails(): SecurityWebsiteServiceDetail[] {
  return SECURITY_SERVICE_SLUGS.map((slug) => ({
    slug,
    ...DEFAULT_SERVICE_DETAILS[slug],
  }));
}

function buildDefaultIndustryDetails(): SecurityWebsiteIndustryDetail[] {
  return SECURITY_INDUSTRY_SLUGS.map((slug) => ({
    slug,
    ...DEFAULT_INDUSTRY_DETAILS[slug],
    recommendedServiceSlug: DEFAULT_INDUSTRY_DETAILS[slug].recommendedService,
  }));
}

export const DEFAULT_SECURITY_WEBSITE_CONTENT: SecurityWebsiteContent = {
  companyName: 'Classic Venture Security (Pvt) Ltd.',
  tagline: 'We never compromise on quality',
  logoUrl: null,
  heroHeadline: 'Licensed manpower. GPS proof on every shift.',
  heroSubheadline:
    'GPS-verified guard attendance, supervisor spot checks with live proof, and a client portal that shows who is on your site right now. Classic Venture pairs trained manpower with Pearzen field technology for 170+ clients with island-wide coverage.',
  heroImageUrl: CV_BROCHURE_ASSETS.hero,
  heroTrainingGallery: buildDefaultHeroTrainingGallery(),
  heroCtaPrimary: 'Request a site assessment',
  heroCtaSecondary: 'Get instant estimate',
  stats: [
    { value: 'GPS', label: 'Verified guard check-in on every shift' },
    { value: 'SM', label: 'Supervisor visits with GPS proof' },
    { value: 'Client Portal', label: 'Live attendance, incidents, and patrol metrics for clients' },
    { value: 'Ministry licensed', label: 'Ministry of Defence registered · trained officers' },
  ],
  servicesTitle: 'Manpower solutions',
  servicesSubtitle:
    'Technology proves attendance and incidents — our officers deliver the presence. Static guards, mobile patrols, guest relations, events, and ex-servicemen task force cover across Sri Lanka.',
  services: [
    {
      slug: 'static-guard',
      title: 'Security guards',
      description:
        'Uniformed officers for commercial, industrial, and residential sites — gate control, access management, and documented post orders.',
    },
    {
      slug: 'mobile-patrol',
      title: 'Visiting officers and patrolling guards',
      description:
        'Motorcycle and jeep-equipped visiting officers for 24/7 spot checks, crisis intervention, and unscheduled site monitoring.',
    },
    {
      slug: 'corporate-facility',
      title: 'Guest relations & facility officers',
      description:
        'Meet & greet personnel, doormen, welcome officers, and guest relation staff for hospitals, hotels, and corporate lobbies.',
    },
    {
      slug: 'event-security',
      title: 'Special functions & bodyguards',
      description:
        'Security for exhibitions, launches, and events — plus personal bodyguards and ex-servicemen special task force when required.',
    },
  ],
  techTitle: 'Pearzen security monitoring platform',
  techSubtitle:
    'End-to-end field operations software — GPS attendance, supervisor verification, incident reporting, and a client-facing transparency dashboard.',
  techImageUrl: CV_BROCHURE_ASSETS.tech,
  techBody:
    'Guards check in with GPS and anti-spoofing verification. Supervisors log GPS-verified site visits with live selfies. Incidents are reported from the field with voice notes and tracked to resolution. Clients log into their portal to see who attended, tap emergency call, and review patrol and incident history — audit-ready proof for every shift.',
  techFeatures: [
    {
      title: 'GPS-verified guard attendance',
      description:
        'Live check-in with geofence validation and anti-spoofing — every guard on your site is provably present, not just rostered.',
    },
    {
      title: 'SM supervisor audits',
      description:
        'Visiting officers authenticate on-site with GPS + live selfie. Clients and ops see verified supervisor presence, not paper sign-offs.',
    },
    {
      title: 'Incident reporting & escalation',
      description:
        'Voice-recorded incident reports from guards and SMs — severity, site, guards involved, and action taken — with status tracking for clients.',
    },
    {
      title: 'Client transparency portal',
      description:
        'Live coverage metrics, GPS-verified activity feed, one-tap emergency call, and patrol compliance — the proof our clients expect.',
    },
  ],
  aboutTitle: 'A trusted name in Sri Lankan security',
  aboutBody:
    'Classic Venture Security (Pvt) Ltd. was established on 7 March 2006 to provide reliable, innovative security solutions. Led by retired Major Susil Perera (BA Def) of the Sri Lanka Army, we employ a highly trained security force including a special task force of experienced ex-servicemen. Serving 170+ clients across Colombo, Kandy, Galle, Anuradhapura, Badulla, Kurunegala, and Matara, we deploy quickly anywhere in the country. Our goal is to be the best security services provider in Sri Lanka, offering clients 100% reliable, state-of-the-art solutions.',
  aboutImageUrl: CV_BROCHURE_ASSETS.about,
  timelineCoverageImageUrl: CV_BROCHURE_ASSETS.visitingOfficers,
  timelineMonitoringImageUrl: CV_BROCHURE_ASSETS.guardAppCheckin,
  ctaHeadline: 'Get manpower and monitoring',
  ctaBody:
    'Call 0753 632 000 or request a site assessment — we will scope guard headcount, shift patterns, and client portal access so your stakeholders see GPS-verified proof from day one.',
  contactPhone: '0753 632 000',
  contactEmail: 'susil@classicventure.com',
  contactAddress: 'No. 196, Park Road, Colombo 05',
  contactEmergencyPhone: '0753 632 003',
  whatsappNumber: '94753632000',
  footerTagline:
    'Classic Venture Security (Pvt) Ltd. — The ultimate in security & manpower solutions.',
  rateCard: DEFAULT_SECURITY_WEBSITE_RATE_CARD,
  compliance: DEFAULT_SECURITY_WEBSITE_COMPLIANCE,
  serviceDetails: buildDefaultServiceDetails(),
  industryDetails: buildDefaultIndustryDetails(),
  testimonials: [
    {
      quote:
        'A Classic Venture officer was commended by the CEO of Lanka Hospitals for detecting a theft — proof of alert, trained personnel on site.',
      author: 'Lanka Hospitals / Apollo',
      role: 'Client commendation',
      industry: 'Healthcare',
    },
    {
      quote:
        'Classic Venture won the Ministry of Defence "Best Firer" trophy on three consecutive training courses — demonstrating our commitment to excellence.',
      author: 'Ministry of Defence Training Centre',
      role: 'Public Security, Law & Order',
      industry: 'Government',
    },
    {
      quote:
        'With 170+ clients island-wide and visiting officers on motorcycles, we can respond to your site anywhere in Sri Lanka — fast.',
      author: 'Classic Venture Operations',
      role: 'Island-wide deployment',
      industry: 'Nationwide',
    },
  ],
  clientsTitle: 'Some of our clients',
  clientsSubtitle:
    'Hospitals, finance, hospitality, energy, and manufacturing leaders rely on Classic Venture for security, guest relations, and facility manpower.',
  clients: buildDefaultClients(),
  faq: [
    {
      question: 'What areas does Classic Venture cover?',
      answer:
        'We operate across all major regions: Colombo, Kandy, Galle, Anuradhapura, Badulla, Kurunegala, and Matara — covering districts island-wide through our network of 170 clients.',
    },
    {
      question: 'Is Classic Venture government approved?',
      answer:
        'Yes — registered with the Ministry of Defence, Registrar General of Companies, Department of Labour (EPF/ETF), Inland Revenue, and member of the Sri Lanka Security Service Providers Association.',
    },
    {
      question: 'What training do your guards receive?',
      answer:
        'Fire fighting, first aid, communication, drill, bomb disposal awareness, log book maintenance, and Ministry of Defence certified programmes.',
    },
    {
      question: 'Do you provide guest relation officers?',
      answer:
        'Yes — meet & greet personnel, doormen, and welcome officers for hospitals, hotels, and corporate facilities.',
    },
    {
      question: 'Do you provide laundry operatives for commercial sites?',
      answer:
        'Yes — trained laundry service operatives for commercial establishments, alongside our security and guest relations teams.',
    },
    {
      question: 'How do I get a quote?',
      answer:
        'Use our online estimator or submit a quote request. Call our direct line on 0753 632 000 or email susil@classicventure.com for immediate assistance.',
    },
  ],
  i18n: {
    si: {
      heroHeadline: 'බලපත්‍ර ලබා ඇති මානව බලය. සෑම වැඩමුරුවකම GPS සාක්ෂි.',
      heroSubheadline:
        'GPS සත්‍යාපිත පැමිණීම්, සංචාරක නිලධාරී සත්‍යාපනය, සහ ඔබේ අඩවියේ කවුද සිටිනවාද යන්න පෙන්වන සේවාලාභී දොරටුව. 2006 සිට මේජර් සුසිල් පෙරේරා මෙහෙයවීමෙන්.',
      heroCtaPrimary: 'අඩවි තක්සේරුවක් ඉල්ලන්න',
      heroCtaSecondary: 'ක්ෂණික ඇස්තමේන්තුව',
    },
    ta: {
      heroHeadline: 'உரிமம் பெற்ற மனிதவளம். ஒவ்வொரு ஷிப்டிலும் GPS சான்று.',
      heroSubheadline:
        'GPS சரிபார்க்கப்பட்ட வருகை, மேற்பார்வையாளர் சரிபார்ப்பு, உங்கள் தளத்தில் யார் உள்ளனர் என்பதைக் காட்டும் வாடிக்கையாளர் போர்டல். 2006 முதல் மேஜர் சுசில் பெரேரா தலைமையில்.',
      heroCtaPrimary: 'தள மதிப்பீடு கோருங்கள்',
      heroCtaSecondary: 'உடனடி மதிப்பீடு',
    },
  },
  opsNotificationEmail: 'susil@classicventure.com',
  imageFrames: {},
};

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asStoredImageUrl(value: unknown, fallback: string): string {
  const raw = asNullableString(value);
  if (!raw) return fallback;
  if (raw.endsWith('/training-parade.jpg') && fallback.endsWith('/guard-app-checkin.jpg')) {
    return fallback;
  }
  return raw;
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function mergeList<T extends Record<string, string>>(
  raw: unknown,
  defaults: T[],
  count: number,
  keys: (keyof T)[],
): T[] {
  const source = Array.isArray(raw) ? raw : [];
  return Array.from({ length: count }, (_, index) => {
    const item = (source[index] ?? {}) as Record<string, unknown>;
    const base = defaults[index] ?? defaults[0];
    const merged = { ...base } as T;
    for (const key of keys) {
      merged[key] = asString(item[key as string], String(base[key])) as T[keyof T];
    }
    return merged;
  });
}

export function syncRankClientRatesWithGuardRanks(
  rates: SecurityWebsiteRankClientRate[],
  guardRankCodes: string[],
): SecurityWebsiteRankClientRate[] {
  const byCode = new Map(rates.map((r) => [r.rankCode, r]));
  const defaultByCode = new Map(
    DEFAULT_SECURITY_WEBSITE_RANK_CLIENT_RATES.map((r) => [r.rankCode, r]),
  );
  return guardRankCodes.map((code) => {
    const existing = byCode.get(code);
    if (existing) return existing;
    const fallback = defaultByCode.get(code);
    return { rankCode: code, clientRatePerShift: fallback?.clientRatePerShift ?? 0 };
  });
}

function mergeRankClientRates(raw: unknown): SecurityWebsiteRankClientRate[] {
  const defaults = DEFAULT_SECURITY_WEBSITE_RANK_CLIENT_RATES;
  const defaultByCode = new Map(defaults.map((r) => [r.rankCode, r]));
  if (!Array.isArray(raw)) return defaults;

  const merged = new Map(defaultByCode);
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const rankCode = asString(row.rankCode, '').toUpperCase();
    if (!rankCode) continue;
    merged.set(rankCode, {
      rankCode,
      clientRatePerShift: asNumber(
        row.clientRatePerShift,
        defaultByCode.get(rankCode)?.clientRatePerShift ?? 0,
      ),
    });
  }
  return Array.from(merged.values());
}

function mergeHeroTrainingGallery(raw: unknown): SecurityWebsiteTrainingGalleryImage[] {
  const defaults = buildDefaultHeroTrainingGallery();
  if (!Array.isArray(raw)) return defaults;

  const parsed = raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const url = stripImageCacheBuster(asNullableString(row.url));
      if (!url) return null;
      const id = asString(row.id, `training-${index + 1}`);
      return { id, url };
    })
    .filter((item): item is SecurityWebsiteTrainingGalleryImage => item !== null)
    .slice(0, SECURITY_WEBSITE_HERO_TRAINING_GALLERY_MAX);

  return parsed.length > 0 ? parsed : defaults;
}

function parseOptionalLogoZoom(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(2.5, Math.max(0.5, Math.round(n * 100) / 100));
}

function mergeClients(raw: unknown): SecurityWebsiteClient[] {
  const defaults = buildDefaultClients();
  if (!Array.isArray(raw) || raw.length === 0) return defaults;

  const parsed = raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const name = asString(row.name, '');
      if (!name) return null;
      const id =
        typeof row.id === 'string' && row.id.trim()
          ? row.id.trim()
          : `client-${index + 1}`;
      const logoZoom = parseOptionalLogoZoom(row.logoZoom);
      return {
        id,
        name,
        logoUrl: resolveSecurityWebsiteClientLogo(name, asNullableString(row.logoUrl)),
        ...(logoZoom !== undefined ? { logoZoom } : {}),
      };
    })
    .filter((c): c is SecurityWebsiteClient => c !== null)
    .filter((c) => !DEPRECATED_SECURITY_WEBSITE_CLIENTS.has(c.name));

  return parsed.length > 0 ? parsed : defaults;
}

function mergeRateCard(raw: unknown): SecurityWebsiteRateCard {
  const d = DEFAULT_SECURITY_WEBSITE_RATE_CARD;
  const data =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const shift = (data.shiftMultipliers ?? {}) as Record<string, unknown>;
  const loc = (data.locationMultipliers ?? {}) as Record<string, unknown>;
  const svc = (data.serviceMultipliers ?? {}) as Record<string, unknown>;
  const contract = (data.contractDiscounts ?? {}) as Record<string, unknown>;

  return {
    baseRatePerGuardHour: asNumber(data.baseRatePerGuardHour, d.baseRatePerGuardHour),
    shiftMultipliers: {
      h8: asNumber(shift.h8, d.shiftMultipliers.h8),
      h12: asNumber(shift.h12, d.shiftMultipliers.h12),
      h24: asNumber(shift.h24, d.shiftMultipliers.h24),
    },
    locationMultipliers: {
      colombo: asNumber(loc.colombo, d.locationMultipliers.colombo),
      greaterColombo: asNumber(loc.greaterColombo, d.locationMultipliers.greaterColombo),
      other: asNumber(loc.other, d.locationMultipliers.other),
    },
    serviceMultipliers: {
      static: asNumber(svc.static, d.serviceMultipliers.static),
      patrol: asNumber(svc.patrol, d.serviceMultipliers.patrol),
      corporate: asNumber(svc.corporate, d.serviceMultipliers.corporate),
      event: asNumber(svc.event, d.serviceMultipliers.event),
    },
    supervisorMonthlyFee: asNumber(data.supervisorMonthlyFee, d.supervisorMonthlyFee),
    armedPremiumPerGuardMonthly: asNumber(
      data.armedPremiumPerGuardMonthly,
      d.armedPremiumPerGuardMonthly,
    ),
    contractDiscounts: {
      m1: asNumber(contract.m1, d.contractDiscounts.m1),
      m6: asNumber(contract.m6, d.contractDiscounts.m6),
      m12: asNumber(contract.m12, d.contractDiscounts.m12),
    },
    daysPerMonth: asNumber(data.daysPerMonth, d.daysPerMonth),
    rankLowMultiplier: asNumber(data.rankLowMultiplier, d.rankLowMultiplier),
    rankHighMultiplier: asNumber(data.rankHighMultiplier, d.rankHighMultiplier),
    rankClientRates: mergeRankClientRates(data.rankClientRates),
  };
}

function mergeCompliance(raw: unknown): SecurityWebsiteCompliance {
  const d = DEFAULT_SECURITY_WEBSITE_COMPLIANCE;
  const data =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    siraRegistrationNumber: asString(data.siraRegistrationNumber, d.siraRegistrationNumber),
    siraValidUntil: asString(data.siraValidUntil, d.siraValidUntil),
    insuranceSummary: asString(data.insuranceSummary, d.insuranceSummary),
    replacementHours: asString(data.replacementHours, d.replacementHours),
    trainingHours: asString(data.trainingHours, d.trainingHours),
    companyRegistration: sanitizeSecurityWebsiteCopy(
      asString(data.companyRegistration, d.companyRegistration),
    ),
    epfCompliant: asBoolean(data.epfCompliant, d.epfCompliant),
  };
}

function mergeServiceDetails(raw: unknown): SecurityWebsiteServiceDetail[] {
  const defaults = buildDefaultServiceDetails();
  if (!Array.isArray(raw)) return defaults;
  return defaults.map((def) => {
    const item = raw.find((r) => (r as SecurityWebsiteServiceDetail)?.slug === def.slug) as
      | SecurityWebsiteServiceDetail
      | undefined;
    if (!item) return def;
    return {
      slug: def.slug,
      title: asString(item.title, def.title),
      description: asString(item.description, def.description),
      whoItsFor: asString(item.whoItsFor, def.whoItsFor),
      included: asString(item.included, def.included),
      shiftPatterns: asString(item.shiftPatterns, def.shiftPatterns),
      faq: Array.isArray(item.faq) && item.faq.length > 0 ? item.faq : def.faq,
    };
  });
}

function mergeIndustryDetails(raw: unknown): SecurityWebsiteIndustryDetail[] {
  const defaults = buildDefaultIndustryDetails();
  if (!Array.isArray(raw)) return defaults;
  return defaults.map((def) => {
    const item = raw.find((r) => (r as SecurityWebsiteIndustryDetail)?.slug === def.slug) as
      | SecurityWebsiteIndustryDetail
      | undefined;
    if (!item) return def;
    return {
      slug: def.slug,
      title: asString(item.title, def.title),
      description: asString(item.description, def.description),
      risks: asString(item.risks, def.risks),
      typicalDeployment: asString(item.typicalDeployment, def.typicalDeployment),
      complianceNotes: asString(item.complianceNotes, def.complianceNotes),
      recommendedServiceSlug: asString(item.recommendedServiceSlug, def.recommendedServiceSlug),
    };
  });
}

function mergeI18n(raw: unknown): Partial<Record<SecurityWebsiteLocale, LocalizedHero>> {
  const defaults = DEFAULT_SECURITY_WEBSITE_CONTENT.i18n;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const data = raw as Record<string, unknown>;
  const locales: SecurityWebsiteLocale[] = ['en', 'si', 'ta'];
  const result: Partial<Record<SecurityWebsiteLocale, LocalizedHero>> = {};
  for (const locale of locales) {
    const entry = data[locale];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    result[locale] = {
      heroHeadline: asString(e.heroHeadline, ''),
      heroSubheadline: asString(e.heroSubheadline, ''),
      heroCtaPrimary: asString(e.heroCtaPrimary, ''),
      heroCtaSecondary: asString(e.heroCtaSecondary, ''),
    };
  }
  return { ...defaults, ...result };
}

function mergeFaqList(raw: unknown, defaults: SecurityWebsiteFaq[]): SecurityWebsiteFaq[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaults;
  const parsed = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const question = asString(row.question, '');
      const answer = asString(row.answer, '');
      if (!question) return null;
      return { question, answer: sanitizeSecurityWebsiteCopy(answer) };
    })
    .filter((f): f is SecurityWebsiteFaq => f !== null);
  return parsed.length > 0 ? parsed : defaults;
}

export function getServiceDetailBySlug(
  content: SecurityWebsiteContent,
  slug: string,
): SecurityWebsiteServiceDetail | undefined {
  return content.serviceDetails.find((s) => s.slug === slug);
}

export function getIndustryDetailBySlug(
  content: SecurityWebsiteContent,
  slug: string,
): SecurityWebsiteIndustryDetail | undefined {
  return content.industryDetails.find((i) => i.slug === slug);
}

/** Strip legacy personnel/location headcount copy from saved CMS content. */
function sanitizeSecurityWebsiteCopy(text: string): string {
  return text
    .replace(/7 March 2008/g, '7 March 2006')
    .replace(/\bestablished 2008\b/g, 'established 2006')
    .replace(/\boperations desk\b/gi, 'direct line')
    .replace(/\bon one contract\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(
      'With 600 personnel across 170 locations — Colombo, Kandy, Galle, Anuradhapura, Badulla, Kurunegala, and Matara —',
      'Serving 170+ clients across Colombo, Kandy, Galle, Anuradhapura, Badulla, Kurunegala, and Matara,',
    )
    .replace('With 170 locations island-wide', 'With 170+ clients island-wide')
    .replace('170 locations across seven regional hubs', '170+ clients across seven regional hubs')
    .replace(
      '600 personnel across 170 locations — Colombo, Kandy, Galle, and regional hubs.',
      '170+ clients across seven regional hubs — Colombo, Kandy, Galle, and island-wide coverage.',
    );
}

export function mergeSecurityWebsiteContent(raw: unknown): SecurityWebsiteContent {
  const data =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const defaults = DEFAULT_SECURITY_WEBSITE_CONTENT;

  return {
    companyName: asString(data.companyName, defaults.companyName),
    tagline: asString(data.tagline, defaults.tagline),
    logoUrl: stripImageCacheBuster(asNullableString(data.logoUrl)),
    heroHeadline: asString(data.heroHeadline, defaults.heroHeadline),
    heroSubheadline: asString(data.heroSubheadline, defaults.heroSubheadline),
    heroImageUrl: asStoredImageUrl(data.heroImageUrl, defaults.heroImageUrl),
    heroTrainingGallery: mergeHeroTrainingGallery(data.heroTrainingGallery),
    heroCtaPrimary: asString(data.heroCtaPrimary, defaults.heroCtaPrimary),
    heroCtaSecondary: asString(data.heroCtaSecondary, defaults.heroCtaSecondary),
    stats: mergeList(data.stats, defaults.stats, SECURITY_WEBSITE_STAT_COUNT, [
      'value',
      'label',
    ]),
    servicesTitle: asString(data.servicesTitle, defaults.servicesTitle),
    servicesSubtitle: asString(data.servicesSubtitle, defaults.servicesSubtitle),
    services: mergeList(
      data.services,
      defaults.services,
      SECURITY_WEBSITE_SERVICE_COUNT,
      ['title', 'description'],
    ).map((svc, i) => ({
      ...svc,
      slug: defaults.services[i]?.slug,
    })),
    techTitle: asString(data.techTitle, defaults.techTitle),
    techSubtitle: asString(data.techSubtitle, defaults.techSubtitle),
    techImageUrl: asStoredImageUrl(data.techImageUrl, defaults.techImageUrl),
    techFeatures: mergeList(
      data.techFeatures,
      defaults.techFeatures,
      SECURITY_WEBSITE_TECH_COUNT,
      ['title', 'description'],
    ),
    techBody: asString(data.techBody, defaults.techBody),
    aboutTitle: asString(data.aboutTitle, defaults.aboutTitle),
    aboutBody: sanitizeSecurityWebsiteCopy(asString(data.aboutBody, defaults.aboutBody)),
    aboutImageUrl: asStoredImageUrl(data.aboutImageUrl, defaults.aboutImageUrl),
    timelineCoverageImageUrl: asStoredImageUrl(
      data.timelineCoverageImageUrl,
      defaults.timelineCoverageImageUrl,
    ),
    timelineMonitoringImageUrl: asStoredImageUrl(
      data.timelineMonitoringImageUrl,
      defaults.timelineMonitoringImageUrl,
    ),
    ctaHeadline: sanitizeSecurityWebsiteCopy(asString(data.ctaHeadline, defaults.ctaHeadline)),
    ctaBody: asString(data.ctaBody, defaults.ctaBody),
    contactPhone: asString(data.contactPhone, defaults.contactPhone),
    contactEmail: asString(data.contactEmail, defaults.contactEmail),
    contactAddress: asString(data.contactAddress, defaults.contactAddress),
    contactEmergencyPhone: asString(
      data.contactEmergencyPhone,
      defaults.contactEmergencyPhone,
    ),
    whatsappNumber: asString(data.whatsappNumber, defaults.whatsappNumber),
    footerTagline: asString(data.footerTagline, defaults.footerTagline),
    rateCard: mergeRateCard(data.rateCard),
    compliance: mergeCompliance(data.compliance),
    serviceDetails: mergeServiceDetails(data.serviceDetails),
    industryDetails: mergeIndustryDetails(data.industryDetails),
    testimonials: mergeList(
      data.testimonials,
      defaults.testimonials,
      SECURITY_WEBSITE_TESTIMONIAL_COUNT,
      ['quote', 'author', 'role', 'industry'],
    ).map((item) => ({ ...item, quote: sanitizeSecurityWebsiteCopy(item.quote) })),
    faq: mergeFaqList(data.faq, defaults.faq),
    clientsTitle: asString(data.clientsTitle, defaults.clientsTitle),
    clientsSubtitle: asString(data.clientsSubtitle, defaults.clientsSubtitle),
    clients: mergeClients(data.clients),
    i18n: mergeI18n(data.i18n),
    opsNotificationEmail: asString(data.opsNotificationEmail, defaults.opsNotificationEmail),
    imageFrames: mergeImageFrames(data.imageFrames),
  };
}

export type { SecurityServiceSlug, SecurityIndustrySlug };
