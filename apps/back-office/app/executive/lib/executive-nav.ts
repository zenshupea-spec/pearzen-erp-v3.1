import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  DollarSign,
  Receipt,
  Map,
  FileText,
  Home,
  Coffee,
  Truck,
  ClipboardList,
  Settings,
  Banknote,
  Shield,
} from 'lucide-react';

export type ExecutiveNavItem = {
  href: string;
  label: string;
  sub: string;
  Icon: LucideIcon;
  /** Featured in the mobile horizontal strip (desktop sidebar still shows all items) */
  mobileStrip?: boolean;
  exact?: boolean;
};

export const EXECUTIVE_NAV: ExecutiveNavItem[] = [
  {
    href: '/executive/operations',
    label: 'CV Operations',
    sub: 'Live Field Radar',
    Icon: Activity,
    mobileStrip: true,
  },
  {
    href: '/executive/finance',
    label: 'Financial Overview',
    sub: 'Enterprise Performance',
    Icon: DollarSign,
    mobileStrip: true,
  },
  {
    href: '/executive/payroll',
    label: 'Payroll',
    sub: 'Compensation Ledger',
    Icon: Banknote,
  },
  {
    href: '/executive/advance',
    label: 'Advance Salary',
    sub: 'MD Approval & Bank Export',
    Icon: FileText,
  },
  {
    href: '/executive/bills',
    label: 'Accounts Payable',
    sub: 'OPEX & Bills Queue',
    Icon: Receipt,
  },
  {
    href: '/executive/sites',
    label: 'Site Directory',
    sub: 'Margin Desk',
    Icon: Map,
  },
  {
    href: '/executive/invoices',
    label: 'AR Approval',
    sub: 'MD · Verify & Confirm Payments',
    Icon: FileText,
  },
  {
    href: '/executive/shalom',
    label: 'Shalom Residence',
    sub: 'Rental Management',
    Icon: Home,
    mobileStrip: true,
  },
  {
    href: '/executive/cafe',
    label: 'Café Auditor',
    sub: 'Compliance & Float',
    Icon: Coffee,
    mobileStrip: true,
  },
  {
    href: '/executive/fleet',
    label: 'Fleet & Assets',
    sub: 'Telematics Radar',
    Icon: Truck,
  },
  {
    href: '/executive/audit',
    label: 'Audit Ledger',
    sub: 'Cross-Portal Activity Log',
    Icon: ClipboardList,
  },
  {
    href: '/executive/access',
    label: 'Security & Access',
    sub: 'Permissions · MFA · Vault',
    Icon: Shield,
    mobileStrip: true,
  },
  {
    href: '/executive/settings',
    label: 'Settings',
    sub: 'Compensation Config',
    Icon: Settings,
  },
];

/** Full sidebar — desktop and any full nav list */
export const EXECUTIVE_SIDEBAR_NAV = EXECUTIVE_NAV;

/** Horizontal pill strip on mobile */
export const EXECUTIVE_MOBILE_STRIP_NAV = EXECUTIVE_NAV.filter((item) => item.mobileStrip);

/** Remaining modules in the mobile “desk” sheet */
export const EXECUTIVE_MOBILE_DESK_NAV = EXECUTIVE_NAV.filter((item) => !item.mobileStrip);

export function executiveNavIsActive(
  pathname: string,
  href: string,
  exact?: boolean,
): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function isExecutiveMobileFocusedPath(pathname: string): boolean {
  return EXECUTIVE_MOBILE_STRIP_NAV.some((item) =>
    executiveNavIsActive(pathname, item.href, item.exact),
  );
}
