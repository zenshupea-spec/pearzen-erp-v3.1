'use client';

import { useCallback, useEffect, useState } from 'react';

import { getFmHolidayCalendarStatus } from './holiday-calendar-actions';

export const FM_HOLIDAY_CALENDAR_EVENT = 'fm-holiday-calendar-updated';

export function notifyFmHolidayCalendarUpdated(incomplete: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FM_HOLIDAY_CALENDAR_EVENT, { detail: incomplete }));
}

/** Reads md_settings holiday calendar completeness for the FM subnav badge. */
export function useFmHolidayCalendarIncomplete(): boolean {
  const [incomplete, setIncomplete] = useState(true);

  const refresh = useCallback(async () => {
    const status = await getFmHolidayCalendarStatus();
    if (status.ok) setIncomplete(status.incomplete);
  }, []);

  useEffect(() => {
    void refresh();

    const onUpdate = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      if (typeof next === 'boolean') setIncomplete(next);
    };

    window.addEventListener(FM_HOLIDAY_CALENDAR_EVENT, onUpdate);
    return () => window.removeEventListener(FM_HOLIDAY_CALENDAR_EVENT, onUpdate);
  }, [refresh]);

  return incomplete;
}
