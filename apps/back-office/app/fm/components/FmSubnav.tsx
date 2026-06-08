'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  Calculator,
  ClipboardList,
  FileSpreadsheet,
  Settings2,
  UserCog,
  UserMinus,
  Users,
} from 'lucide-react';

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
  items: FmNavItem[];
};

const FM_NAV_SECTIONS: FmNavSection[] = [
  {
    label: 'Payroll',
    items: [
      { label: 'Site Payroll Ledger', href: '/fm', exact: true, icon: FileSpreadsheet },
      { label: 'Employee Register', href: '/fm/roster', exact: true, icon: Users },
      { label: 'Batch Execution', href: '/fm/batch', exact: true, icon: Calculator },
      { label: 'Timesheet Roll-ups', href: '/fm/batch/timesheets', icon: ClipboardList },
      { label: 'Offboarding settlements', href: '/fm/offboarding', exact: true, icon: UserMinus },
    ],
  },
  {
    label: 'Sites & ops',
    items: [
      { label: 'Site Directory (Shared)', href: '/fm/sites', icon: Building2 },
      { label: 'SM Handler', href: '/fm/sm-handler', icon: UserCog },
      {
        label: 'Discrepancy Queue',
        href: '/fm/discrepancy-queue',
        icon: AlertTriangle,
        showDiscrepancyBadge: true,
      },
    ],
  },
  {
    label: 'Pearzen',
    items: [
      {
        label: 'Pearzen.tech payment',
        href: '/fm/pearzen-payment',
        exact: true,
        icon: Bell,
      },
    ],
  },
  {
    label: 'Configuration',
    items: [
      {
        label: 'Finance Settings (Shared)',
        href: '/fm/settings#holiday-calendar',
        icon: Settings2,
        showHolidayBadge: true,
      },
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
  `relative inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[10px] font-bold leading-tight transition-all sm:px-3 sm:text-[11px] ${
    active
      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <span className="w-full px-2 pb-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 sm:w-auto sm:pb-0 sm:pr-1">
        {label}
      </span>
      {children}
    </div>
  );
}

export type FmSubnavProps = {
  holidayCalendarIncomplete?: boolean;
  discrepancyCount?: number;
};

export default function FmSubnav({
  holidayCalendarIncomplete,
  discrepancyCount,
}: FmSubnavProps) {
  const pathname = usePathname() ?? '';

  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8">
      <Link
        href="/dashboard"
        className="inline-flex max-w-full items-center gap-2 self-start rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 sm:px-3 sm:text-xs"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <span className="truncate">Return to HQ Hub</span>
      </Link>

      <nav
        className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm backdrop-blur-xl sm:p-3"
        aria-label="Finance Manager portal sections"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-2">
          {FM_NAV_SECTIONS.map((section, sectionIndex) => (
            <div
              key={section.label}
              className="flex min-w-0 flex-col gap-3 lg:flex-1 lg:flex-row lg:items-center lg:gap-2"
            >
              {sectionIndex > 0 && (
                <div
                  className="hidden h-8 w-px shrink-0 bg-slate-200/90 lg:block"
                  aria-hidden
                />
              )}
              <NavSection label={section.label}>
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
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="max-w-[11rem] text-left sm:max-w-none">{item.label}</span>
                      {showDiscrepancyBadge && (
                        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                          {discrepancyCount}
                        </span>
                      )}
                      {showHolidayBadge && (
                        <span
                          className="pointer-events-none absolute -right-0.5 -top-1.5 z-10 inline-flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 px-1 py-px text-[8px] font-black leading-none text-red-700 shadow-sm"
                          title="Dates Required"
                        >
                          <Bell className="h-2 w-2 shrink-0" aria-hidden />
                          <span className="hidden sm:inline">Dates Req.</span>
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
              </NavSection>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
