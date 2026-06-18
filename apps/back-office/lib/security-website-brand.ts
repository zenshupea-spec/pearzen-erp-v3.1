/** Classic Venture brochure brand tokens */
export const CV_BRAND = {
  red: '#B91C1C',
  redDark: '#7F1D1D',
  green: '#166534',
  greenLight: '#15803D',
  gold: '#EAB308',
  goldDark: '#CA8A04',
  silver: '#D1D5DB',
  charcoal: '#1F2937',
} as const;

export type SecurityWebsiteBrochureImageSlot =
  | 'hero'
  | 'about'
  | 'tech'
  | 'coverage'
  | 'monitoring';

/** Staff group photo — contain in short timeline cards so the full team stays visible. */
export const CV_BROCHURE_ABOUT_IMAGE_CROP = {
  objectPosition: 'center center',
  objectFit: 'contain' as const,
} as const;

/** Nationwide formation — wide timeline card; full frame, no zoom. */
export const CV_BROCHURE_VISITING_OFFICERS_IMAGE_CROP = {
  objectPosition: 'center center',
} as const;

export const CV_BROCHURE_ASSETS = {
  hero: '/security-brochure/assets/hero-guards-formation.jpg',
  about: '/security-brochure/assets/about-staff-batch.jpg',
  tech: '/security-brochure/assets/training-parade.jpg',
  guardAppCheckin: '/security-brochure/assets/guard-app-checkin.jpg',
  staticGuard: '/security-brochure/assets/service-static-guard.jpg',
  guestRelations: '/security-brochure/assets/service-guest-relations.jpg',
  visitingOfficers: '/security-brochure/assets/visiting-officers.jpg',
  warriors: '/security-brochure/assets/brand-warriors.jpg',
  trainingFirstAid: '/security-brochure/assets/training-first-aid.jpg',
  trainingParade: '/security-brochure/assets/training-parade.jpg',
  lankaHospitals: '/security-brochure/assets/clients/lanka-hospitals.png',
} as const;

const BROCHURE_SLOT_FALLBACKS: Record<SecurityWebsiteBrochureImageSlot, string> = {
  hero: CV_BROCHURE_ASSETS.hero,
  about: CV_BROCHURE_ASSETS.about,
  tech: CV_BROCHURE_ASSETS.tech,
  coverage: CV_BROCHURE_ASSETS.visitingOfficers,
  monitoring: CV_BROCHURE_ASSETS.guardAppCheckin,
};

/** Brochure fallback when no custom image is stored in settings. */
export function resolveSecurityWebsiteSlotImage(
  url: string | null | undefined,
  slot: SecurityWebsiteBrochureImageSlot,
): string {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  return trimmed || BROCHURE_SLOT_FALLBACKS[slot];
}

export const CV_BROCHURE_CLIENTS = [
  'Bellvantage (Pvt) Limited',
  'Distilleries Company of Sri Lanka Ltd',
  'Ambewela Farm (Lanka Milk Foods Group)',
  'Melsta Corp Limited',
  'Texpro Industries Ltd',
  'Tech One Global',
  'Dole Lanka (Pvt) Limited',
  'Qualitea Ceylon (Pvt) Limited',
  'ALFT Packaging Co. (Pvt) Ltd',
  'Jaal Salon',
  'Tea Trails (Pvt) Limited',
  'Hunnas Falls Hotel',
  'Tree Of Life Nature Resort',
  'Tear Drop Hotels (Pvt) Ltd',
  'LB Finance PLC',
  'UB Finance Plc',
  'National Asset Management Ltd',
  'Singer Finance Lanka Plc',
  'A Baurs & Company',
  'Global Transportation',
  'Kahawita De Silva Associates',
  'United Serendib Corporation (Pvt) Ltd',
  'Boruka Power Lanka (Pvt) Limited',
  'Lalan Cinnamon Processing Centre',
  'Finetex Pvt Ltd',
  'Ranketi Rubber Mills (Pvt) Ltd',
  'S Square Leisure',
  'Senaro Motor Company (Pvt) Ltd',
  'Flexicare Lanka (Pvt) Ltd',
  'Yugashakthi (Guarantee) Limited',
  "People's Leasing & Finance PLC",
  'Mclarens Containers (Pvt) Ltd',
  'Transmare-Chemie',
  'Testa Bake House (Pvt) Ltd',
  'Saffron Beach Hotel',
  'Yvonne Lanka (Pvt) Ltd',
  'Earls Regency Hotel',
  'Summerhill Bungalow Nuwara Eliya',
  'State Pharmaceuticals Corporation',
  'Amora Lagoon Hotel',
  'Palm Oil Processing (Pvt.) Ltd',
  'Tamarind Tree Garden Resort',
  'VLCC',
  'Joseph Fraser Memorial Hospital',
  'Stassen Group',
  'Contrinex',
  'Kent RO Systems',
  'Prasad The Fashion Square',
  'Loadstar',
  'Continental Insurance',
  'Victoria Golf & Country Resort',
  'Uga Escapes',
  'Lanka Hospitals',
  'Aitken Spence PLC',
  'MangalaTex',
  'CBS',
  'Commercial Leasing & Finance PLC',
] as const;

/** Removed from the public grid — broken or missing logo assets. */
export const DEPRECATED_SECURITY_WEBSITE_CLIENTS = new Set([
  'Lanka Bell Limited',
  'Lanka Bell',
]);

/** High-quality logos sourced from official company websites and brand assets. */
export const CV_BROCHURE_CLIENT_LOGOS: Partial<Record<(typeof CV_BROCHURE_CLIENTS)[number], string>> = {
  'Bellvantage (Pvt) Limited': '/security-brochure/assets/clients/bellvantage.png',
  'Distilleries Company of Sri Lanka Ltd': '/security-brochure/assets/clients/dcsl.png',
  'Ambewela Farm (Lanka Milk Foods Group)': '/security-brochure/assets/clients/ambewela-farm.png',
  'Melsta Corp Limited': '/security-brochure/assets/clients/melstacorp.png',
  'Texpro Industries Ltd': '/security-brochure/assets/clients/texpro.png',
  'Tech One Global': '/security-brochure/assets/clients/tech-one-global.png',
  'Jaal Salon': '/security-brochure/assets/clients/jaal-salon.png',
  'Dole Lanka (Pvt) Limited': '/security-brochure/assets/clients/dole-lanka.png',
  'Qualitea Ceylon (Pvt) Limited': '/security-brochure/assets/clients/qualitea.png',
  'Tea Trails (Pvt) Limited': '/security-brochure/assets/clients/tea-trails.png',
  'Hunnas Falls Hotel': '/security-brochure/assets/clients/hunas-falls-hotel.png',
  'Tree Of Life Nature Resort': '/security-brochure/assets/clients/tree-of-life-nature-resort.png',
  'Tear Drop Hotels (Pvt) Ltd': '/security-brochure/assets/clients/teardrop-hotels.png',
  'LB Finance PLC': '/security-brochure/assets/clients/lb-finance.png',
  'UB Finance Plc': '/security-brochure/assets/clients/ub-finance.png',
  'National Asset Management Ltd': '/security-brochure/assets/clients/namal.png',
  'Singer Finance Lanka Plc': '/security-brochure/assets/clients/singer-finance.png',
  'A Baurs & Company': '/security-brochure/assets/clients/baurs.png',
  'ALFT Packaging Co. (Pvt) Ltd': '/security-brochure/assets/clients/alft-packaging.png',
  'Global Transportation': '/security-brochure/assets/clients/global-transportation.png',
  'Kahawita De Silva Associates': '/security-brochure/assets/clients/kahawita-de-silva.png',
  'United Serendib Corporation (Pvt) Ltd': '/security-brochure/assets/clients/united-serendib.png',
  'Finetex Pvt Ltd': '/security-brochure/assets/clients/finetex.png',
  'Flexicare Lanka (Pvt) Ltd': '/security-brochure/assets/clients/flexicare.png',
  'Testa Bake House (Pvt) Ltd': '/security-brochure/assets/clients/testa-bake-house.png',
  'Earls Regency Hotel': '/security-brochure/assets/clients/earls-regency.png',
  'Boruka Power Lanka (Pvt) Limited': '/security-brochure/assets/clients/boruka-power-lanka.png',
  'Lalan Cinnamon Processing Centre': '/security-brochure/assets/clients/lalan-cinnamon.png',
  'Senaro Motor Company (Pvt) Ltd': '/security-brochure/assets/clients/senaro-motor.png',
  "People's Leasing & Finance PLC": '/security-brochure/assets/clients/peoples-leasing.png',
  'Mclarens Containers (Pvt) Ltd': '/security-brochure/assets/clients/mclarens-containers.png',
  'Transmare-Chemie': '/security-brochure/assets/clients/transmare-chemie.png',
  'Saffron Beach Hotel': '/security-brochure/assets/clients/saffron-beach-hotel.png',
  'Yvonne Lanka (Pvt) Ltd': '/security-brochure/assets/clients/yvonne-lanka.png',
  'Palm Oil Processing (Pvt.) Ltd': '/security-brochure/assets/clients/palm-oil-processing.png',
  'Summerhill Bungalow Nuwara Eliya': '/security-brochure/assets/clients/summerhill-bungalow.png',
  'State Pharmaceuticals Corporation': '/security-brochure/assets/clients/state-pharmaceuticals.png',
  'Amora Lagoon Hotel': '/security-brochure/assets/clients/amora-lagoon.png',
  'Tamarind Tree Garden Resort': '/security-brochure/assets/clients/tamarind-tree.png',
  VLCC: '/security-brochure/assets/clients/vlcc.png',
  'Joseph Fraser Memorial Hospital': '/security-brochure/assets/clients/joseph-fraser-memorial-hospital.png',
  'Stassen Group': '/security-brochure/assets/clients/stassen-group.png',
  Contrinex: '/security-brochure/assets/clients/contrinex.png',
  'Kent RO Systems': '/security-brochure/assets/clients/kent.png',
  'Prasad The Fashion Square': '/security-brochure/assets/clients/prasad-fashion-square.png',
  Loadstar: '/security-brochure/assets/clients/loadstar.png',
  'Continental Insurance': '/security-brochure/assets/clients/continental-insurance.png',
  'Victoria Golf & Country Resort': '/security-brochure/assets/clients/victoria-golf-country-resort.png',
  'Uga Escapes': '/security-brochure/assets/clients/uga-escapes.png',
  'Lanka Hospitals': '/security-brochure/assets/clients/lanka-hospitals.png',
  'Aitken Spence PLC': '/security-brochure/assets/clients/aitken-spence.png',
  MangalaTex: '/security-brochure/assets/clients/mangalatex.png',
  CBS: '/security-brochure/assets/clients/cbs.png',
  'Commercial Leasing & Finance PLC': '/security-brochure/assets/clients/commercial-leasing-finance.png',
};

/** Legacy brochure / CMS names mapped to the current client list. */
const CV_BROCHURE_CLIENT_LOGO_ALIASES: Record<string, (typeof CV_BROCHURE_CLIENTS)[number]> = {
  Bellvantage: 'Bellvantage (Pvt) Limited',
  'Ambewela Farms': 'Ambewela Farm (Lanka Milk Foods Group)',
  'Distilleries Company of Sri Lanka': 'Distilleries Company of Sri Lanka Ltd',
  Melstacorp: 'Melsta Corp Limited',
  'Dole Lanka': 'Dole Lanka (Pvt) Limited',
  Qualitea: 'Qualitea Ceylon (Pvt) Limited',
  'Tea Trails': 'Tea Trails (Pvt) Limited',
  'Hunas Falls Hotel': 'Hunnas Falls Hotel',
  'Tree of Life Nature Resort': 'Tree Of Life Nature Resort',
  'TearDrop Hotels': 'Tear Drop Hotels (Pvt) Ltd',
  'LB Finance': 'LB Finance PLC',
  'UB Finance': 'UB Finance Plc',
  'Singer Finance': 'Singer Finance Lanka Plc',
  "People's Leasing & Finance": "People's Leasing & Finance PLC",
  Baurs: 'A Baurs & Company',
  'Boruka Power Lanka': 'Boruka Power Lanka (Pvt) Limited',
  Kent: 'Kent RO Systems',
  'Commercial Leasing & Finance': 'Commercial Leasing & Finance PLC',
  'Aitken Spence': 'Aitken Spence PLC',
};

/** Default logo tile sizing in SecurityClientsSection. */
export const SECURITY_WEBSITE_CLIENT_LOGO_IMG_CLASS =
  'max-h-[5.5rem] max-w-[min(100%,12rem)] w-auto h-auto object-contain object-center sm:max-h-[5.75rem] md:max-h-[6rem]';

/** Enlarged sizing for logos that read too small at the default scale. */
export const SECURITY_WEBSITE_CLIENT_LOGO_IMG_CLASS_LARGE =
  'max-h-[8.5rem] max-w-[min(100%,18rem)] w-auto h-auto object-contain object-center sm:max-h-[9rem] md:max-h-[9.5rem]';

const SECURITY_WEBSITE_LARGE_LOGO_CLIENTS = new Set<string>([
  'Global Transportation',
  'Kahawita De Silva Associates',
  'United Serendib Corporation (Pvt) Ltd',
  'Flexicare Lanka (Pvt) Ltd',
  'Stassen Group',
  'Loadstar',
  'Aitken Spence PLC',
  'Continental Insurance',
]);

export function getSecurityWebsiteClientLogoImgClass(name: string): string {
  return SECURITY_WEBSITE_LARGE_LOGO_CLIENTS.has(name)
    ? SECURITY_WEBSITE_CLIENT_LOGO_IMG_CLASS_LARGE
    : SECURITY_WEBSITE_CLIENT_LOGO_IMG_CLASS;
}

/** Brochure fallback when a stored client row has no custom logo. */
export function resolveSecurityWebsiteClientLogo(
  name: string,
  logoUrl: string | null | undefined,
): string | null {
  const trimmed = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  const bundled =
    CV_BROCHURE_CLIENT_LOGOS[name as (typeof CV_BROCHURE_CLIENTS)[number]] ??
    (CV_BROCHURE_CLIENT_LOGO_ALIASES[name]
      ? CV_BROCHURE_CLIENT_LOGOS[CV_BROCHURE_CLIENT_LOGO_ALIASES[name]]
      : null);

  // Prefer curated brochure assets for known clients — sharper than ad-hoc CMS uploads.
  if (bundled) return bundled;
  if (trimmed) return trimmed;

  return null;
}

export const CV_COVERAGE_REGIONS = [
  { name: 'Colombo Region', districts: 'Colombo, Gampaha' },
  { name: 'Kandy Region', districts: 'Kandy, Matale' },
  { name: 'Galle Region', districts: 'Galle, Kalutara' },
  {
    name: 'Anuradhapura Region',
    districts: 'Ampara, Anuradhapura, Batticaloa, Jaffna, Kilinochchi, Mullaitivu, Polonnaruwa, Trincomalee, Vavuniya',
  },
  { name: 'Badulla Region', districts: 'Badulla, Moneragala, Nuwara Eliya, Ratnapura' },
  { name: 'Kurunegala Region', districts: 'Kegalle, Kurunegala, Mannar, Puttalam' },
  { name: 'Matara Region', districts: 'Hambantota, Matara' },
] as const;
