'use client';

import { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';

import {
  getCafeShiftCheckinContext,
  type CafeShiftCheckinContext,
} from '../../app/cafe-front/actions';
import { CafeCheckinButton } from './CafeCheckinButton';
import { CafeCheckoutButton } from './CafeCheckoutButton';
import { CafeFrontSchedulePreview } from './CafeFrontSchedulePreview';
import { CafeGeolocationProvider } from './CafeGeolocationContext';
import BrandWatermarkBackground from '../portal/BrandWatermarkBackground';
import { CVS_BRAND_CLASSES } from '../../lib/cvs-brand-tokens';
import type { CafeShiftGate } from '../../lib/cafe-front-shift';

function formatTime(value: string) {
  const [h, m] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CafeFrontGateHero({
  cafeLogoUrl,
  eyebrow,
  title,
  description,
}: {
  cafeLogoUrl: string | null;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="relative">
          <div
            className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl ${
              cafeLogoUrl
                ? 'border border-slate-200 bg-white shadow-lg shadow-slate-900/10'
                : 'border border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100 shadow-lg shadow-orange-200/40'
            }`}
          >
            {cafeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cafeLogoUrl} alt="" className="h-full w-full object-contain p-2" />
            ) : (
              <Coffee className="h-8 w-8 text-orange-700" strokeWidth={1.75} />
            )}
          </div>
        </div>
      </div>
      <div>
        <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${CVS_BRAND_CLASSES.portalEyebrow}`}>
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-black uppercase leading-tight tracking-tight text-slate-900">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-xs font-medium leading-relaxed text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function CafeShiftGateBody({
  mode,
  mustCheckout,
  onCancelCheckout,
}: {
  mode: 'check-in' | 'check-out';
  mustCheckout?: boolean;
  onCancelCheckout?: () => void;
}) {
  const isCheckIn = mode === 'check-in';

  return (
    <div className="mt-5 space-y-4">
      <CafeFrontSchedulePreview />

      <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
        {isCheckIn ? (
          <CafeCheckinButton />
        ) : (
          <CafeCheckoutButton
            forced={mustCheckout}
            onCancel={mustCheckout ? undefined : onCancelCheckout}
          />
        )}
      </div>

      {isCheckIn ? (
        <p className="text-center text-[10px] leading-relaxed text-slate-500">
          Bookmark <span className="font-mono font-semibold text-slate-600">/cafe-front/check-in</span>{' '}
          for a stable link. Any café tab shows this gate until you check in — the bottom bar
          appears only after unlock.
        </p>
      ) : null}
    </div>
  );
}

export function CafeShiftGateSection({
  mode,
  cafeLogoUrl,
  companyLogoUrl,
  shiftGate,
  mustCheckout,
  onCancelCheckout,
}: {
  mode: 'check-in' | 'check-out';
  cafeLogoUrl: string | null;
  companyLogoUrl: string | null;
  shiftGate: CafeShiftGate;
  mustCheckout?: boolean;
  onCancelCheckout?: () => void;
}) {
  const [checkinContext, setCheckinContext] = useState<CafeShiftCheckinContext | null>(null);
  const isCheckIn = mode === 'check-in';

  useEffect(() => {
    let cancelled = false;
    void getCafeShiftCheckinContext().then((ctx) => {
      if (!cancelled) setCheckinContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const site = checkinContext
    ? {
        siteLat: checkinContext.siteLat,
        siteLng: checkinContext.siteLng,
        geofenceRadiusM: checkinContext.geofenceRadiusM,
      }
    : null;

  return (
    <section className="relative flex flex-1 flex-col overflow-y-auto overscroll-contain">
      <BrandWatermarkBackground logoUrl={companyLogoUrl} mode="portal" fadeStrength="light" />

      <div className="relative z-10 flex flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
        <CafeFrontGateHero
          cafeLogoUrl={cafeLogoUrl}
          eyebrow={isCheckIn ? 'Shift check-in' : 'Shift check-out'}
          title={
            isCheckIn
              ? 'Verify location to unlock'
              : mustCheckout
                ? 'End your shift'
                : 'Verify location to check out'
          }
          description={
            isCheckIn
              ? `GPS + selfie at the café site. Portal stays open 1 hour after close (${formatTime(shiftGate.portalGraceEnd)}). Check-in is not a bottom tab — it unlocks every café screen once verified.`
              : 'GPS + selfie at the café site to complete your shift.'
          }
        />

        <CafeGeolocationProvider site={site}>
          <CafeShiftGateBody
            mode={mode}
            mustCheckout={mustCheckout}
            onCancelCheckout={onCancelCheckout}
          />
        </CafeGeolocationProvider>
      </div>
    </section>
  );
}
