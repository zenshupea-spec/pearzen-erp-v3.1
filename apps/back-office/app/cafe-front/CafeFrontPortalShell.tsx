'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  Coffee,
  LogOut,
  ShoppingBag,
  Tag,
} from 'lucide-react';

import { CafeShiftGateSection } from '../../components/cafe-front/CafeShiftGateSection';
import type { CafeShiftGate } from '../../lib/cafe-front-shift';
import {
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

function formatTime(value: string) {
  const [h, m] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function CafeFrontPortalShell({
  staffName,
  shiftGate,
  avgPrepLabel,
  cafeLogoUrl = null,
  companyLogoUrl = null,
  children,
}: {
  staffName: string;
  shiftGate: CafeShiftGate;
  avgPrepLabel?: string | null;
  cafeLogoUrl?: string | null;
  companyLogoUrl?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [showCheckoutFlow, setShowCheckoutFlow] = useState(false);

  const portalUnlocked = shiftGate.portalAccessible;
  const mustCheckout = shiftGate.activeOnShift && !shiftGate.portalAccessible;
  const checkoutVisible = mustCheckout || showCheckoutFlow;

  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <header className="sticky top-0 z-40 shrink-0 border-b border-white/60 bg-white/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black uppercase tracking-tight text-slate-900">
              Café Front
            </h1>
            <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {staffName}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {portalUnlocked ? (
              <span className="rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800">
                On shift
              </span>
            ) : mustCheckout ? (
              <span className="rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">
                Check out
              </span>
            ) : (
              <span className="rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">
                Check in
              </span>
            )}
            {portalUnlocked && avgPrepLabel ? (
              <span className="rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-800">
                Avg {avgPrepLabel}
              </span>
            ) : null}
            {portalUnlocked && !checkoutVisible ? (
              <button
                type="button"
                onClick={() => setShowCheckoutFlow(true)}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-3 w-3" />
                Check out
              </button>
            ) : null}
          </div>
        </div>
        {portalUnlocked ? (
          <p className="mt-2 text-[10px] font-semibold text-slate-500">
            Portal open until {formatTime(shiftGate.portalGraceEnd)} (1h after close)
          </p>
        ) : null}
      </header>

      {checkoutVisible ? (
        <CafeShiftGateSection
          mode="check-out"
          cafeLogoUrl={cafeLogoUrl}
          companyLogoUrl={companyLogoUrl}
          shiftGate={shiftGate}
          mustCheckout={mustCheckout}
          onCancelCheckout={() => setShowCheckoutFlow(false)}
        />
      ) : portalUnlocked ? (
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">
          <div className="space-y-6 pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      ) : (
        <CafeShiftGateSection
          mode="check-in"
          cafeLogoUrl={cafeLogoUrl}
          companyLogoUrl={companyLogoUrl}
          shiftGate={shiftGate}
        />
      )}

      {portalUnlocked && !checkoutVisible ? (
        <nav
          aria-label="Café front office"
          className="shrink-0 border-t border-slate-200/80 bg-white/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl"
        >
          <div className="grid grid-cols-5 gap-0.5 px-1">
            {CAFE_FRONT_PORTAL_TABS.map(({ href, shortLabel }) => {
              const active = pathname === href;
              const Icon = TAB_ICONS[href];
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[9px] font-bold leading-none transition-all active:scale-95 ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 2} />
                  <span className="max-w-full truncate">{shortLabel}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
