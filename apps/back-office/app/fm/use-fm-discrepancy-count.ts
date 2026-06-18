'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pearzen.fm.discrepancy-unresolved-count';

/** Matches UNRESOLVED rows in discrepancy-queue INITIAL_DEFICITS. */
export const FM_INITIAL_UNRESOLVED_DEFICIT_COUNT = 2;

const COUNT_EVENT = 'fm-discrepancy-count';

function readStoredCount(): number {
  if (typeof window === 'undefined') return FM_INITIAL_UNRESOLVED_DEFICIT_COUNT;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return FM_INITIAL_UNRESOLVED_DEFICIT_COUNT;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : FM_INITIAL_UNRESOLVED_DEFICIT_COUNT;
}

export function setFmDiscrepancyUnresolvedCount(count: number) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, String(count));
  window.dispatchEvent(new CustomEvent(COUNT_EVENT, { detail: count }));
}

/** Unresolved deficit count for the FM Discrepancies nav badge. */
export function useFmDiscrepancyCount(): number {
  const [count, setCount] = useState(FM_INITIAL_UNRESOLVED_DEFICIT_COUNT);

  useEffect(() => {
    setCount(readStoredCount());

    const onCountChange = (event: Event) => {
      const next = (event as CustomEvent<number>).detail;
      if (typeof next === 'number' && next >= 0) setCount(next);
    };

    window.addEventListener(COUNT_EVENT, onCountChange);
    return () => window.removeEventListener(COUNT_EVENT, onCountChange);
  }, []);

  return count;
}
