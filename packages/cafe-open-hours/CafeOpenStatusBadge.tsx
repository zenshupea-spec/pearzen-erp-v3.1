'use client';

import { useEffect, useState } from 'react';

import { CAFE_COVER_BAND_TEXT_SHADOW, getCafeOpenStatus } from '../cafe-open-hours';

export function CafeOpenStatusBadge({
  openStart,
  openEnd,
  className = '',
  style,
  coverTextColor,
}: {
  openStart: string;
  openEnd: string;
  className?: string;
  style?: React.CSSProperties;
  coverTextColor?: string;
}) {
  const badgeStyle: React.CSSProperties | undefined = coverTextColor
    ? { color: coverTextColor, textShadow: CAFE_COVER_BAND_TEXT_SHADOW, ...style }
    : style;
  const [status, setStatus] = useState(() => getCafeOpenStatus(openStart, openEnd));

  useEffect(() => {
    const tick = () => setStatus(getCafeOpenStatus(openStart, openEnd));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [openStart, openEnd]);

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-[9px] font-black backdrop-blur-md ${className}`}
      style={badgeStyle}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status.isOpen ? 'bg-emerald-300' : 'bg-white/70'}`}
        aria-hidden
      />
      {status.label}
    </span>
  );
}
