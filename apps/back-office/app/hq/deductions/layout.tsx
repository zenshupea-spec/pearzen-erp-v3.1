'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Building2, CalendarDays, Package, PackagePlus, RotateCcw, Shirt, UtensilsCrossed } from 'lucide-react';
import DeductionsMonthLockBar from './DeductionsMonthLockBar';
import { DeductionsPayrollMonthProvider } from './DeductionsPayrollMonthContext';

const SUB_LINKS: {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}[] = [
  { href: '/hq/deductions', label: 'Monthly entries', icon: CalendarDays, exact: true },
  { href: '/hq/deductions/site-suppliers', label: 'Site suppliers', icon: Building2 },
  { href: '/hq/deductions/suppliers', label: 'Meal suppliers', icon: UtensilsCrossed },
  { href: '/hq/deductions/uniform-suppliers', label: 'Uniform stock', icon: Shirt },
  { href: '/hq/deductions/uniform-courier', label: 'Courier queue', icon: Package },
  { href: '/hq/deductions/uniform-collecting', label: 'Uniform collecting', icon: RotateCcw },
  { href: '/hq/deductions/uniform-issue', label: 'Uniform issue', icon: Shirt },
  { href: '/hq/deductions/issue-vo-stock', label: 'Issue VO stock', icon: PackagePlus },
];

const linkClass = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold leading-tight transition-all ${
    active
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export default function DeductionsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <DeductionsPayrollMonthProvider>
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              Finance & Billing
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
              Deductions Admin
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Review uniform recoveries (auto-filled from issues) and edit meal amounts by site.
              When ready, lock the month and send to FM — she cannot lock payroll until then.
            </p>
          </div>
          <DeductionsMonthLockBar />
        </div>

        <nav
          className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm backdrop-blur-xl sm:p-3"
          aria-label="Deductions sections"
        >
          <div className="flex flex-wrap gap-1.5">
            {SUB_LINKS.map((link) => {
              const active = isActive(link.href, link.exact);
              const Icon = link.icon;
              if (active) {
                return (
                  <span key={link.href} className={linkClass(true)} aria-current="page">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {link.label}
                  </span>
                );
              }
              return (
                <Link key={link.href} href={link.href} className={linkClass(false)}>
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {children}
      </div>
    </DeductionsPayrollMonthProvider>
  );
}
