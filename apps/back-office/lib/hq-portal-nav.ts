import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  Calculator,
  FileText,
  Layers,
  Receipt,
  Scissors,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';

import { OM_HUB_ENTRY_PATH } from './hq-hub';

export type HqPortalNavEntry = {
  href: string;
  label: string;
  sub: string;
  roles?: string;
  Icon: LucideIcon;
  accent: string;
};

/** Shared portal list for HQ hub home cards (server-safe — no 'use client'). */
export const HQ_PORTAL_NAV: readonly HqPortalNavEntry[] = [
  {
    href: '/executive/finance',
    label: 'Executive Vault',
    sub: 'MD operations radar',
    roles: 'MD · OD',
    Icon: Settings,
    accent: 'violet',
  },
  {
    href: OM_HUB_ENTRY_PATH,
    label: 'CV Operations',
    sub: 'Live field radar',
    Icon: ShieldAlert,
    accent: 'rose',
  },
  {
    href: '/tm',
    label: 'Territory Manager',
    sub: 'Verification & guard cards',
    Icon: Layers,
    accent: 'indigo',
  },
  {
    href: '/hr/mnr',
    label: 'Master Nominal Roll',
    sub: 'Live employee registry',
    Icon: Users,
    accent: 'emerald',
  },
  {
    href: '/fm',
    label: 'Finance Manager',
    sub: 'Payroll & deductions',
    Icon: Calculator,
    accent: 'amber',
  },
  {
    href: '/hq/deductions',
    label: 'HQ Deductions',
    sub: 'Meals & uniform ledger',
    Icon: Scissors,
    accent: 'sky',
  },
  {
    href: '/invoice-desk',
    label: 'Invoice Desk',
    sub: 'AR & collections',
    Icon: Receipt,
    accent: 'blue',
  },
  {
    href: '/hq/guard-proxy',
    label: 'Guard check-in stream',
    sub: 'Field attendance feed',
    Icon: ShieldAlert,
    accent: 'slate',
  },
  {
    href: '/hq/sm-proxy',
    label: 'SM field stream',
    sub: 'Rosters & site visits',
    Icon: Briefcase,
    accent: 'amber',
  },
  {
    href: '/hq/audit',
    label: 'Portal Activity Ledger',
    sub: 'Cross-portal immutable activity log',
    roles: 'MD · OD · FM · EA',
    Icon: FileText,
    accent: 'slate',
  },
];
