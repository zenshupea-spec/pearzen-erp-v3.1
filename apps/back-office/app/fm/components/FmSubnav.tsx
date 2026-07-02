'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFmDiscrepancyCount } from '../use-fm-discrepancy-count';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Bell,
  Building2,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  History,
  CalendarDays,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { CVS_BRAND_CLASSES } from '../../../lib/cvs-brand-tokens';

type FmNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  showDiscrepancyBadge?: boolean;
  showHolidayBadge?: boolean;
};

type FmNavSection = {
  label: string;
  description: string;
  items: FmNavItem[];
};

const FM_NAV_SECTIONS: FmNavSection[] = [
  {
    label: 'Payroll',
    description: 'Ledger, lock & bank dispatch',
    items: [
      { label: 'Payroll Ledger', href: '/fm', exact: true, icon: FileSpreadsheet },
      { label: 'Timesheets', href: '/fm/batch/timesheets', icon: ClipboardList },
      { label: 'Advance', href: '/fm/advance', icon: Coins },
      { label: 'Stop List', href: '/fm/stop-list', icon: History },
      { label: 'Hold List', href: '/fm/hold-list', icon: Banknote },
      { label: 'Exceptions', href: '/fm/exceptions', icon: ShieldAlert },
    ],
  },
  {
    label: 'People',
    description: 'Roster & settlements',
    items: [
      { label: 'Employees', href: '/fm/roster', exact: true, icon: Users },
      { label: 'Sector Managers', href: '/fm/sm-handler', icon: UserCog },
    ],
  },
  {
    label: 'Sites & setup',
    description: 'Directory, alerts & config',
    items: [
      { label: 'Site Directory', href: '/fm/sites', icon: Building2 },
      {
        label: 'Discrepancies',
        href: '/fm/discrepancy-queue',
        icon: AlertTriangle,
        showDiscrepancyBadge: true,
      },
      {
        label: 'Holiday Calendar',
        href: '/fm/settings#holiday-calendar',
        icon: CalendarDays,
        showHolidayBadge: true,
      },
      { label: 'Account Security', href: '/account/security', icon: ShieldCheck },
      { label: 'SaaS Billing', href: '/fm/pearzen-payment', exact: true, icon: Wallet },
    ],
  },
];

function navPath(href: string) {
  return href.split('#')[0];
}

function isNavActive(pathname: string, href: string, exact?: boolean) {
  const path = navPath(href);
  if (exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

const linkClass = (active: boolean) =>
  `relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold leading-tight transition-all sm:px-3.5 sm:text-sm ${
    active
      ? `${CVS_BRAND_CLASSES.mobileTabActive} border-transparent`
      : 'text-slate-600 hover:bg-[var(--cvs-accent-soft)]/80 hover:text-[color:var(--cvs-accent)]'
  }`;

export type FmSubnavProps = {
  holidayCalendarIncomplete?: boolean;
  discrepancyCount?: number;
};

export default function FmSubnav({
  holidayCalendarIncomplete,
  discrepancyCount: discrepancyCountProp,
}: FmSubnavProps) {
  const pathname = usePathname() ?? '';
  const storedDiscrepancyCount = useFmDiscrepancyCount();
  const discrepancyCount = discrepancyCountProp ?? storedDiscrepancyCount;

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-slate-200/80 bg-[#eef2f6]/95 px-4 pb-4 pt-2 backdrop-blur-md sm:-mx-6 sm:mb-8 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]/60 hover:text-[color:var(--cvs-accent)]"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">HQ Hub</span>
        </Link>
        <span
          className={`hidden text-[10px] font-bold uppercase tracking-[0.2em] sm:inline ${CVS_BRAND_CLASSES.portalEyebrow}`}
        >
          Finance Manager
        </span>
      </div>

      <nav
        className="w-full min-w-0 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Finance Manager portal sections"
      >
        <div className="flex min-w-max flex-col gap-4 xl:min-w-0 xl:flex-row xl:items-stretch xl:divide-x xl:divide-slate-200">
          {FM_NAV_SECTIONS.map((section, sectionIndex) => (
            <div
              key={section.label}
              className="flex min-w-0 flex-col gap-2.5 xl:flex-1 xl:px-4 xl:first:pl-0 xl:last:pr-0"
            >
              <div className="px-0.5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {section.label}
                </p>
                <p className="mt-0.5 hidden text-[10px] font-medium text-slate-400 sm:block">
                  {section.description}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {section.items.map((item) => {
                  const active = isNavActive(pathname, item.href, item.exact);
                  const Icon = item.icon;
                  const showDiscrepancyBadge =
                    item.showDiscrepancyBadge &&
                    discrepancyCount != null &&
                    discrepancyCount > 0;
                  const showHolidayBadge =
                    item.showHolidayBadge && holidayCalendarIncomplete;

                  const content = (
                    <>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{item.label}</span>
                      {showDiscrepancyBadge && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white">
                          {discrepancyCount}
                        </span>
                      )}
                      {showHolidayBadge && (
                        <span
                          className="pointer-events-none absolute -right-1 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-red-700 shadow-sm"
                          title="Holiday calendar dates required"
                        >
                          <Bell className="h-2.5 w-2.5 shrink-0" aria-hidden />
                          <span className="hidden sm:inline">Dates</span>
                        </span>
                      )}
                    </>
                  );

                  if (active) {
                    return (
                      <span
                        key={item.href}
                        className={linkClass(true)}
                        aria-current="page"
                      >
                        {content}
                      </span>
                    );
                  }

                  return (
                    <Link key={item.href} href={item.href} className={linkClass(false)}>
                      {content}
                    </Link>
                  );
                })}
              </div>
              {sectionIndex < FM_NAV_SECTIONS.length - 1 && (
                <div className="mt-1 h-px bg-slate-100 xl:hidden" aria-hidden />
              )}
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
