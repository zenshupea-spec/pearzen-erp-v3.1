'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { isFromHqHub } from './hq-hub';

const HQ_HUB_ENTRY_KEY = 'pearzen:hq-hub-entry';

export function markHqHubEntry(): void {
  try {
    sessionStorage.setItem(HQ_HUB_ENTRY_KEY, '1');
  } catch {
    // ignore private browsing / disabled storage
  }
}

export function clearHqHubEntry(): void {
  try {
    sessionStorage.removeItem(HQ_HUB_ENTRY_KEY);
  } catch {
    // ignore
  }
}

export function readHqHubEntry(): boolean {
  try {
    return sessionStorage.getItem(HQ_HUB_ENTRY_KEY) === '1';
  } catch {
    return false;
  }
}

/** True when the user opened this portal from HQ Master Hub (URL or session). */
export function useHqHubEntry(): boolean {
  const searchParams = useSearchParams();
  const [active, setActive] = useState(() => readHqHubEntry());

  useEffect(() => {
    if (isFromHqHub(searchParams)) {
      markHqHubEntry();
      setActive(true);
      return;
    }
    setActive(readHqHubEntry());
  }, [searchParams]);

  return active;
}
