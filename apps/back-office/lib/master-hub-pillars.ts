export type MasterHubModule = {
  label: string;
  description: string;
  route: string;
  badge?: string;
  subtext?: string;
  isProxy?: boolean;
};

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
        badge: '4 Sites Short',
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
        badge: '12 Rosters Pending',
        isProxy: true,
      },
      {
        label: 'Check-in App',
        description:
          'Guard attendance and geofenced check-in stream, viewed from HQ.',
        route: '/hq/guard-proxy',
        badge: '3 Missed Scans',
        isProxy: true,
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
        badge: '2 Batches Pending',
      },
      {
        label: 'Deductions Admin',
        description:
          'Review and approve deduction entries before payroll lock.',
        route: '/hq/deductions',
        badge: '5 Unapproved',
      },
      {
        label: 'Invoice Desk',
        description:
          'Client invoice management, aging reports, and payment reconciliation.',
        route: '/invoice-desk',
        badge: 'LKR 1.2M Overdue',
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
        badge: '8 Expiring Clearances',
      },
      {
        label: 'Open Vacancies & Ads',
        description:
          'Manage active job postings, candidate pipeline, and recruitment workflows.',
        route: '/hr/onboarding',
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
        badge: 'Stock Alert',
      },
      {
        label: 'Master Audit Ledger',
        description:
          'System-wide audit trail across all modules and user actions.',
        route: '/executive/audit',
        subtext: 'Excludes MD/OD Vault activity',
      },
    ],
  },
];
