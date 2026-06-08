'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Coffee, Package, Tag } from 'lucide-react';
import { HQ_HUB_PATH } from '../../../lib/hq-hub';
import {
  CAFE_COMPLIANCE_PATH,
  CAFE_EXPIRY_PATH,
  CAFE_INGREDIENTS_PATH,
  CAFE_MENU_PATH,
  CAFE_PORTAL_TABS,
  cafePortalHref,
} from './cafe-portal-nav';

const TAB_ICONS = {
  [CAFE_COMPLIANCE_PATH]: Coffee,
  [CAFE_INGREDIENTS_PATH]: Package,
  [CAFE_EXPIRY_PATH]: CalendarDays,
  [CAFE_MENU_PATH]: Tag,
} as const;

export function CafePortalShell({
  hubView,
  subtitle,
  children,
}: {
  hubView: boolean;
  subtitle: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromHub = searchParams.get('hub') === '1';
  const hubNav = fromHub || hubView;

  return (
    <div className="w-full flex-grow flex flex-col pb-12 font-sans">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-6 md:px-12 2xl:px-24 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
        {hubNav ? (
          <Link
            href={HQ_HUB_PATH}
            className="mb-3 inline-flex max-w-full items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-800 sm:text-xs"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Return to HQ Hub</span>
          </Link>
        ) : null}

        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 md:text-3xl">
            Café Tasha
          </h1>
          <p className="mt-1 text-sm font-bold uppercase tracking-widest text-slate-500">{subtitle}</p>
        </div>

        <nav className="mt-4 flex flex-wrap gap-1 border-t border-slate-200/70 pt-3">
          {CAFE_PORTAL_TABS.map(({ href, label }) => {
            const active = pathname === href;
            const Icon = TAB_ICONS[href];
            return (
              <Link
                key={href}
                href={cafePortalHref(href, hubNav)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white/70'
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="space-y-6 px-6 pt-8 md:px-12 2xl:px-24">{children}</div>
    </div>
  );
}
