import type { ServiceType } from './security-website-calculator';

export const SECURITY_SERVICE_SLUGS = [
  'static-guard',
  'mobile-patrol',
  'corporate-facility',
  'event-security',
] as const;

export type SecurityServiceSlug = (typeof SECURITY_SERVICE_SLUGS)[number];

export const SECURITY_INDUSTRY_SLUGS = [
  'banks-finance',
  'hotels-hospitality',
  'factories-boi',
] as const;

export type SecurityIndustrySlug = (typeof SECURITY_INDUSTRY_SLUGS)[number];

export const SERVICE_SLUG_TO_TYPE: Record<SecurityServiceSlug, ServiceType> = {
  'static-guard': 'static',
  'mobile-patrol': 'patrol',
  'corporate-facility': 'corporate',
  'event-security': 'event',
};

export function isSecurityServiceSlug(slug: string): slug is SecurityServiceSlug {
  return (SECURITY_SERVICE_SLUGS as readonly string[]).includes(slug);
}

export function isSecurityIndustrySlug(slug: string): slug is SecurityIndustrySlug {
  return (SECURITY_INDUSTRY_SLUGS as readonly string[]).includes(slug);
}

export const DEFAULT_SERVICE_DETAILS: Record<
  SecurityServiceSlug,
  {
    title: string;
    description: string;
    whoItsFor: string;
    included: string;
    shiftPatterns: string;
    faq: { question: string; answer: string }[];
  }
> = {
  'static-guard': {
    title: 'Static & gate security',
    description:
      'Uniformed officers for entrances, lobbies, and perimeter control — with documented handover procedures and visitor management.',
    whoItsFor:
      'Office towers, residential gates, warehouses, and retail entrances that need a visible deterrent and controlled access.',
    included:
      'Uniformed guard(s), post orders, visitor log, shift handover notes, GPS-verified attendance, and supervisor spot checks.',
    shiftPatterns: '8-hour day/night, 12-hour continuous, or 24-hour coverage with relief rotation.',
    faq: [
      {
        question: 'How quickly can you deploy?',
        answer: 'Standard posts within 48–72 hours after site assessment; emergency cover subject to availability.',
      },
      {
        question: 'Do you replace absent guards?',
        answer: 'Yes — relief within our committed replacement window, documented in your service agreement.',
      },
    ],
  },
  'mobile-patrol': {
    title: 'Mobile patrol & response',
    description:
      'Scheduled and random patrol routes with GPS-stamped checkpoints, incident reporting, and rapid escalation.',
    whoItsFor:
      'Estates, industrial parks, construction yards, and multi-building campuses needing coverage beyond a single post.',
    included:
      'Foot patrol routes, checkpoint scans, incident logs, alarm response coordination, and route compliance reports.',
    shiftPatterns: 'Random and scheduled patrols — typically 2–6 visits per night depending on risk profile.',
    faq: [
      {
        question: 'Can patrols integrate with our alarm panel?',
        answer: 'Yes — we coordinate with your monitoring provider and document every attendance at alarm events.',
      },
      {
        question: 'How do you prove patrols happened?',
        answer: 'GPS-stamped checkpoints and timestamped logs available for your audit team.',
      },
    ],
  },
  'corporate-facility': {
    title: 'Corporate & facility security',
    description:
      'Multi-site programmes for offices, warehouses, and campuses — rank-structured teams aligned to your SOPs.',
    whoItsFor:
      'Enterprises with multiple locations, BOI zones, and audit requirements needing consistent standards.',
    included:
      'Site risk assessments, rank-structured teams, account manager, monthly performance reports, and technology dashboard access.',
    shiftPatterns: 'Custom shift matrices per site — day, night, and weekend patterns aligned to operations.',
    faq: [
      {
        question: 'Can you align to our corporate SOPs?',
        answer: 'Yes — post orders and escalation paths are documented and trained before go-live.',
      },
      {
        question: 'Do you provide account management?',
        answer: 'Corporate programmes include a dedicated account contact and scheduled review meetings.',
      },
    ],
  },
  'event-security': {
    title: 'Event & temporary cover',
    description:
      'Short-notice manpower for launches, exhibitions, and peak seasons — vetted guards with clear chain of command.',
    whoItsFor:
      'Conferences, product launches, festivals, seasonal retail peaks, and short-term construction phases.',
    included:
      'Briefing, crowd-flow planning support, access control, supervisor on site, and post-event debrief.',
    shiftPatterns: 'Single-day to multi-week deployments — flexible headcount scaling.',
    faq: [
      {
        question: 'What is the minimum notice period?',
        answer: '48 hours for standard events; speak to ops for same-week emergency cover.',
      },
      {
        question: 'Are guards briefed on venue layout?',
        answer: 'Yes — pre-event briefing and supervisor walkthrough before doors open.',
      },
    ],
  },
};

export const DEFAULT_INDUSTRY_DETAILS: Record<
  SecurityIndustrySlug,
  {
    title: string;
    description: string;
    risks: string;
    typicalDeployment: string;
    complianceNotes: string;
    recommendedService: SecurityServiceSlug;
  }
> = {
  'banks-finance': {
    title: 'Banks & finance',
    description: 'Branch and ATM perimeter security with audit-ready documentation.',
    risks: 'Cash handling exposure, after-hours intrusion, customer safety incidents.',
    typicalDeployment: 'Static posts at entrances, dual-guard night cover for high-value branches.',
    complianceNotes: 'SIRA-compliant manpower, documented incident escalation, and visitor control logs.',
    recommendedService: 'static-guard',
  },
  'hotels-hospitality': {
    title: 'Hotels & hospitality',
    description: 'Guest safety, lobby presence, and back-of-house access control.',
    risks: 'Unauthorized access, guest disputes, luggage and vehicle theft.',
    typicalDeployment: 'Lobby concierge security, parking patrols, and night shift perimeter posts.',
    complianceNotes: 'Discreet uniform options, multilingual officers where required, tourism-sector experience.',
    recommendedService: 'corporate-facility',
  },
  'factories-boi': {
    title: 'Factories & BOI zones',
    description: 'Industrial perimeter control and shift-change traffic management.',
    risks: 'Theft of materials, unauthorized contractor access, fire lane obstruction.',
    typicalDeployment: 'Gate posts, truck inspection protocols, and mobile patrols for large yards.',
    complianceNotes: 'BOI audit support, EPF-compliant payroll, supervisor visit verification.',
    recommendedService: 'mobile-patrol',
  },
};
