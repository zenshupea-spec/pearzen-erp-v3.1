export type CafeOpenHours = {
  openStart: string;
  openEnd: string;
};

export const DEFAULT_CAFE_OPEN_HOURS: CafeOpenHours = {
  openStart: '07:00',
  openEnd: '19:00',
};

/** Legibility shadow for open-status badge on menu cover bands. */
export const CAFE_COVER_BAND_TEXT_SHADOW =
  '0 2px 10px rgba(0,0,0,0.72), 0 0 3px rgba(0,0,0,0.55), 0 1px 0 rgba(0,0,0,0.35)';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function normalizeCafeOpenTime(value: unknown, fallback: string): string {
  const s = typeof value === 'string' ? value.trim() : '';
  return /^\d{2}:\d{2}$/.test(s) ? s : fallback;
}

export function isWithinCafeOpenHours(
  openStart: string,
  openEnd: string,
  date = new Date(),
): boolean {
  const nowMins = date.getHours() * 60 + date.getMinutes();
  const startMins = timeToMinutes(openStart);
  const endMins = timeToMinutes(openEnd);

  if (startMins <= endMins) {
    return nowMins >= startMins && nowMins <= endMins;
  }

  return nowMins >= startMins || nowMins <= endMins;
}

export function formatCafeOpenTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function getCafeOpenStatus(
  openStart: string,
  openEnd: string,
  date = new Date(),
): { isOpen: boolean; label: string } {
  if (isWithinCafeOpenHours(openStart, openEnd, date)) {
    return { isOpen: true, label: 'Open now' };
  }

  const nowMins = date.getHours() * 60 + date.getMinutes();
  const startMins = timeToMinutes(openStart);
  const endMins = timeToMinutes(openEnd);

  if (startMins <= endMins) {
    if (nowMins < startMins) {
      return { isOpen: false, label: `Opens ${formatCafeOpenTimeLabel(openStart)}` };
    }
    return { isOpen: false, label: 'Closed' };
  }

  if (nowMins > endMins && nowMins < startMins) {
    return { isOpen: false, label: `Opens ${formatCafeOpenTimeLabel(openStart)}` };
  }

  return { isOpen: false, label: 'Closed' };
}
