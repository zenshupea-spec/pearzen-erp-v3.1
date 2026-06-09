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

export type MasterHubPillar = {
  title: string;
  modules: MasterHubModule[];
};

/** Categorized HQ hub modules — mirrors the original localhost Master Hub layout. */
export const MASTER_HUB_PILLARS: MasterHubPillar[] = [
  {
    title: 'Field Operations',
    modules: [
      {
        label: 'CV Operations',
        description:
          'Live field radar — tactical deployment, guard cards, sector health, and deficit triage.',
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
        route: '/hq/sm-proxy',
        isProxy: true,
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
