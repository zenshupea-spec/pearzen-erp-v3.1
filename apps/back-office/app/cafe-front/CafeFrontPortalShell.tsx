'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  Camera,
  ClipboardList,
  Coffee,
  ShoppingBag,
  Tag,
} from 'lucide-react';

import type { CafeShiftGate } from '../../lib/cafe-front-shift';
import {
  CAFE_FRONT_CHECKIN_PATH,
  CAFE_FRONT_COMPLIANCE_PATH,
  CAFE_FRONT_EXPIRY_PATH,
  CAFE_FRONT_MENU_PATH,
  CAFE_FRONT_ORDERS_PATH,
  CAFE_FRONT_PORTAL_TABS,
  CAFE_FRONT_ROSTER_PATH,
} from './cafe-front-nav';

const TAB_ICONS = {
  [CAFE_FRONT_COMPLIANCE_PATH]: ClipboardList,
  [CAFE_FRONT_ORDERS_PATH]: ShoppingBag,
  [CAFE_FRONT_ROSTER_PATH]: CalendarDays,
  [CAFE_FRONT_EXPIRY_PATH]: Coffee,
  [CAFE_FRONT_MENU_PATH]: Tag,
} as const;

export function CafeFrontPortalShell({
  staffName,
  shiftGate,
  avgPrepLabel,
  children,
}: {
  staffName: string;
  shiftGate: CafeShiftGate;
  avgPrepLabel?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="w-full flex-grow flex flex-col pb-12 font-sans">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/45 px-6 md:px-12 2xl:px-24 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 md:text-3xl">
              Café Front Office
            </h1>
            <p className="mt-1 text-sm font-bold uppercase tracking-widest text-slate-500">
              {staffName} · Counter &amp; kitchen operations
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {shiftGate.canAcceptOrders ? (
              <span className="rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                On shift · orders enabled
              </span>
            ) : (
              <Link
                href={CAFE_FRONT_CHECKIN_PATH}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800 hover:bg-amber-100/80"
              >
                <Camera className="h-3 w-3" />
                Check in to accept orders
              </Link>
            )}
            {avgPrepLabel ? (
              <span className="rounded-full border border-sky-200/80 bg-sky-50/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-sky-800">
                Avg prep {avgPrepLabel}
              </span>
            ) : null}
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-1 border-t border-slate-200/70 pt-3">
          {CAFE_FRONT_PORTAL_TABS.map(({ href, label }) => {
            const active = pathname === href;
            const Icon = TAB_ICONS[href];
            return (
              <Link
                key={href}
                href={href}
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
