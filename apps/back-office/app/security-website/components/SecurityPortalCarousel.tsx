'use client';

import { useEffect, useState } from 'react';

import SecurityClientPortalPreview from './SecurityClientPortalPreview';
import SecurityGuardPortalPreview from './SecurityGuardPortalPreview';
import SecuritySmPortalPreview from './SecuritySmPortalPreview';

const SLIDE_INTERVAL_MS = 4000;

const SLIDES = [
  { id: 'guard', label: 'Guard app', render: () => <SecurityGuardPortalPreview showDemoLabel={false} /> },
  { id: 'sm', label: 'SM app', render: () => <SecuritySmPortalPreview showDemoLabel={false} /> },
  {
    id: 'client',
    label: 'Client portal',
    render: () => <SecurityClientPortalPreview showDemoLabel={false} />,
  },
] as const;

function circularOffset(index: number, active: number, length: number): number {
  let diff = index - active;
  if (diff > length / 2) diff -= length;
  if (diff < -length / 2) diff += length;
  return diff;
}

function slideTransform(offset: number, spread = 1): {
  translateX: number;
  rotateY: number;
  scale: number;
  opacity: number;
  zIndex: number;
} {
  const tx = (value: number) => value * spread;
  if (offset === 0) {
    return { translateX: 0, rotateY: 0, scale: 1, opacity: 1, zIndex: 30 };
  }
  if (offset === 1) {
    return { translateX: tx(118), rotateY: -42, scale: 0.86, opacity: 0.92, zIndex: 20 };
  }
  if (offset === -1) {
    return { translateX: tx(-118), rotateY: 42, scale: 0.86, opacity: 0.92, zIndex: 20 };
  }
  return {
    translateX: offset > 0 ? tx(200) : tx(-200),
    rotateY: offset > 0 ? -55 : 55,
    scale: 0.72,
    opacity: 0,
    zIndex: 10,
  };
}

export default function SecurityPortalCarousel() {
  const [active, setActive] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [spread, setSpread] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const syncLayout = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSpread(1);
        return;
      }
      if (width < 380) setSpread(0.55);
      else if (width < 480) setSpread(0.72);
      else setSpread(0.88);
    };
    syncLayout();
    window.addEventListener('resize', syncLayout);
    return () => window.removeEventListener('resize', syncLayout);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <div className="mx-auto w-full max-w-[480px] overflow-x-hidden px-2">
      <div
        className="relative mx-auto h-[500px] w-full"
        style={
          isMobile
            ? undefined
            : { perspective: '1400px', perspectiveOrigin: '50% 42%' }
        }
        aria-live="polite"
        aria-roledescription="carousel"
        aria-label="Pearzen portal demos"
      >
        {SLIDES.map((slide, index) => {
          const offset = circularOffset(index, active, SLIDES.length);
          const { translateX, rotateY, scale, opacity, zIndex } = slideTransform(offset, spread);
          const isActive = offset === 0;

          return (
            <div
              key={slide.id}
              className="absolute left-1/2 top-0 w-[240px] max-w-full transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform max-md:max-w-[min(240px,calc(100vw-1rem))]"
              style={{
                transform: isMobile
                  ? 'translateX(-50%)'
                  : `translateX(calc(-50% + ${translateX}px)) rotateY(${rotateY}deg) scale(${scale})`,
                opacity: isMobile && !isActive ? 0 : opacity,
                zIndex: isMobile ? (isActive ? 30 : 10) : zIndex,
                transformStyle: isMobile ? undefined : 'preserve-3d',
                pointerEvents: isMobile && !isActive ? 'none' : undefined,
              }}
              aria-hidden={!isActive}
            >
              {slide.render()}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col items-center gap-2">
        <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Demo preview — not connected to live systems
        </p>
        <div className="flex items-center gap-2" role="tablist" aria-label="Portal demo slides">
          {SLIDES.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={slide.label}
              onClick={() => setActive(index)}
              className={`rounded-full transition-all ${
                index === active
                  ? 'h-2 w-6 bg-red-700'
                  : 'h-2 w-2 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          {SLIDES[active].label}
        </p>
      </div>
    </div>
  );
}
