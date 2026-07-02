'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  FORGE_CLIENT_SEGMENTS,
  forgeSegmentAccent,
  parseForgeClientSegment,
  type ForgeClientSegment,
} from './forge-client-segments';
import { FORGE_PORTAL_THEME as T } from './forge-portal-theme';

type ForgeSegmentBarProps = {
  /** When set, segment changes are controlled by the parent instead of URL alone. */
  active?: ForgeClientSegment;
  onChange?: (segment: ForgeClientSegment) => void;
  className?: string;
};

export default function ForgeSegmentBar({ active, onChange, className = '' }: ForgeSegmentBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSegment = parseForgeClientSegment(searchParams.get('segment'));
  const current = active ?? urlSegment;

  const setSegment = useCallback(
    (segment: ForgeClientSegment) => {
      onChange?.(segment);
      const params = new URLSearchParams(searchParams.toString());
      params.set('segment', segment);
      const query = params.toString();
      router.replace(query ? `/forge/clients?${query}` : '/forge/clients', { scroll: false });
    },
    [onChange, router, searchParams],
  );

  return (
    <div className={className}>
      <div
        className={`${T.card} flex flex-col gap-3 p-2 sm:flex-row sm:items-stretch`}
        role="tablist"
        aria-label="Client categories"
      >
        {FORGE_CLIENT_SEGMENTS.map((segment) => {
          const isActive = current === segment.id;
          const accent = forgeSegmentAccent(segment.id);

          return (
            <button
              key={segment.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSegment(segment.id)}
              className={`flex min-w-0 flex-1 flex-col rounded-xl border px-4 py-3 text-left transition-all ${
                isActive ? accent.active : accent.idle
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${isActive ? accent.dot : 'bg-slate-300'}`}
                  aria-hidden
                />
                <span className="text-sm font-bold tracking-tight">{segment.label}</span>
                <span className="hidden text-[10px] font-semibold uppercase tracking-wider opacity-60 sm:inline">
                  {segment.shortLabel}
                </span>
              </span>
              <span className="mt-1 hidden text-xs leading-snug opacity-75 md:block">
                {segment.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { parseForgeClientSegment, type ForgeClientSegment } from './forge-client-segments';
