'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  showLabel?: boolean;
  /** `fill` expands to use the demos panel column; `compact` is the sidebar-sized frame. */
  size?: 'compact' | 'fill';
};

/** ~iPhone 14 logical ratio (390×844). */
const PHONE_ASPECT = 'aspect-[390/844]';

const PHONE_FRAME_BASE =
  'overflow-hidden rounded-[1.75rem] border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/40';

const SIZE_STYLES = {
  compact: {
    wrapper: 'mx-auto w-[240px] max-w-full shrink-0',
    frame: `h-[500px] w-[240px] ${PHONE_FRAME_BASE}`,
  },
  fill: {
    wrapper: 'flex h-full w-full min-h-0 flex-col items-center justify-center',
    frame: `${PHONE_ASPECT} h-[min(100cqh,calc(100cqw*844/390))] w-[min(100cqw,calc(100cqh*390/844))] shrink-0 ${PHONE_FRAME_BASE}`,
  },
} as const;

export default function SecurityPortalDemoShell({
  children,
  className = '',
  showLabel = true,
  size = 'compact',
}: Props) {
  const styles = SIZE_STYLES[size];

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <div className={styles.frame}>
        <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
      {showLabel ? (
        <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Demo preview — not connected to live systems
        </p>
      ) : null}
    </div>
  );
}
