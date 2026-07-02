import { CVS_INTERNAL_WORKFORCE_ONLY } from './cvs-workforce-phase';

export type MasterHubModule = {
  label: string;
  description: string;
  route: string;
  badge?: string;
  subtext?: string;
  isProxy?: boolean;
  external?: boolean;
};

/** Logical route key for the guard field PWA (resolved to external URL in Master Hub). */
export const GUARD_FIELD_PORTAL_ROUTE = 'guard-field-portal';

/** Café front-line staff portal (EPF login · orders · compliance photos). */
export const CAFE_FRONT_PORTAL_ROUTE = 'cafe-front-portal';

/** Shalom caretaker front-line portal (EPF login · property calendars). */
export const SHALOM_FRONT_PORTAL_ROUTE = 'shalom-front-portal';

/** Sector manager field PWA (EPF login · rosters · site visits). */
export const SM_PORTAL_ROUTE = 'sm-portal';

export type MasterHubPillar = {
  title: string;
  modules: MasterHubModule[];
};

/** Routes hidden from HQ Master Hub while guard field ops are paused. */
const INTERNAL_WORKFORCE_HIDDEN_HUB_ROUTES = new Set([
  '/tm',
  SM_PORTAL_ROUTE,
  GUARD_FIELD_PORTAL_ROUTE,
  '/hr/vacancies',
]);

function applyInternalWorkforceHubFilter(
  pillars: MasterHubPillar[],
): MasterHubPillar[] {
  if (!CVS_INTERNAL_WORKFORCE_ONLY) return pillars;

  return pillars
    .map((pillar) => ({
      ...pillar,
      modules: pillar.modules.filter(
        (mod) => !INTERNAL_WORKFORCE_HIDDEN_HUB_ROUTES.has(mod.route),
      ),
    }))
    .filter((pillar) => pillar.modules.length > 0);
}

/** Categorized HQ hub modules — mirrors the original localhost Master Hub layout. */
const MASTER_HUB_PILLARS_BASE: MasterHubPillar[] = [
  {
    title: 'Field Operations',
    modules: [
      {
        label: 'CV Operations',
        description: CVS_INTERNAL_WORKFORCE_ONLY
          ? 'Head Office & café workforce — live roster counts and internal staffing links.'
          : 'Live field radar — tactical deployment, guard cards, sector health, and deficit triage.',
        route: '/om',
      },
      {
        label: 'TM Command Center',
        description:
          'Shift verification, guard performance cards, and site GPS configuration.',
        route: '/tm',
      },
      {
        label: 'SM Portal',
        description:
          'Sector manager view — roster assignments, guard performance, and shift handovers.',
        route: SM_PORTAL_ROUTE,
        external: true,
      },
      {
        label: 'Check-in App',
        description:
          'Guard attendance and geofenced check-in — open the field portal.',
        route: GUARD_FIELD_PORTAL_ROUTE,
        external: true,
      },
      {
        label: 'Café Front Office',
        description:
          'Counter staff portal — compliance photos, order queue, expiry lots, menu requests, and roster leave.',
        route: CAFE_FRONT_PORTAL_ROUTE,
        external: true,
      },
      {
        label: 'Shalom Front Office',
        description:
          'Caretaker portal — assigned property calendars, guest collect amounts, and daily login compliance.',
        route: SHALOM_FRONT_PORTAL_ROUTE,
        external: true,
      },
    ],
  },
  {
    title: 'Finance & Billing',
    modules: [
      {
        label: 'Finance & Payroll',
        description:
          'Payroll processing, salary bank export, and deductions — not client AR collections.',
        route: '/fm',
      },
      {
        label: 'Deductions Admin',
        description:
          'Review and approve deduction entries before payroll lock.',
        route: '/hq/deductions',
      },
      {
        label: 'Invoice Desk',
        description:
          'Client invoice management, aging reports, and payment reconciliation.',
        route: '/invoice-desk',
      },
    ],
  },
  {
    title: 'HR & Workforce',
    modules: [
      {
        label: 'HR Operations Desk',
        description:
          'Workforce management, roster administration, advances, and personnel records.',
        route: '/hr',
      },
      {
        label: 'Open Vacancies & Ads',
        description:
          'Sites understaffed by rank — JSO, OIC, and other guard slots with addresses for recruitment.',
        route: '/hr/vacancies',
      },
    ],
  },
  {
    title: 'Auxiliary & Governance',
    modules: [
      {
        label: 'Company Website',
        description:
          'Public security services marketing site — manpower and technology positioning for prospective clients.',
        route: '/security-website',
      },
      {
        label: 'Shalom Guest Website',
        description:
          'Public holiday rental site — property listings, direct bookings, and guest confirmation for Shalom Residence.',
        route: '/shalom-public?edit=1',
      },
      {
        label: 'Café Backoffice',
        description:
          'Café roster, float reconciliation, inventory, and daily operations.',
        route: '/executive/cafe',
      },
      {
        label: 'Portal Activity Ledger',
        description:
          'Immutable cross-portal activity log — every staff portal change is recorded.',
        route: '/hq/audit',
      },
    ],
  },
];

export const MASTER_HUB_PILLARS = applyInternalWorkforceHubFilter(
  MASTER_HUB_PILLARS_BASE,
);

/** WFM-only hub — HR, finance, and attendance (no field ops / invoice desk). */
export const WFM_HUB_PILLARS: MasterHubPillar[] = [
  {
    title: 'Workforce',
    modules: [
      {
        label: 'HR Operations Desk',
        description:
          'Workforce management, roster administration, advances, and personnel records.',
        route: '/hr',
      },
      {
        label: 'Master Nominal Roll',
        description:
          'Personnel registry, clearance tracking, and employee master data.',
        route: '/hr/mnr',
      },
    ],
  },
  {
    title: 'Finance & Payroll',
    modules: [
      {
        label: 'Finance & Payroll',
        description:
          'Payroll processing, salary bank export, and deductions — not client AR collections.',
        route: '/fm',
      },
      {
        label: 'Deductions Admin',
        description:
          'Review and approve deduction entries before payroll lock.',
        route: '/hq/deductions',
      },
    ],
  },
  {
    title: 'Attendance',
    modules: [
      {
        label: 'Check-in Stream',
        description:
          'Live attendance feed — geofenced check-ins and missed scan triage.',
        route: '/hq/guard-proxy',
      },
    ],
  },
];
