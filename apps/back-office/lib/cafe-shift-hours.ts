/** Standard paid café shift length — matches payroll engine (B/26/9). */
export const CAFE_STANDARD_SHIFT_HOURS = 9;

export type CafeShiftWindow = {
  start: string;
  end: string;
};

export type CafeShiftWindows = {
  morning: CafeShiftWindow;
  evening: CafeShiftWindow;
};

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function formatMinutesToTime(mins: number): string {
  const normalized = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeCafeShiftWindows(openStart: string, openEnd: string): CafeShiftWindows {
  const startMins = parseTimeToMinutes(openStart);
  const endMins = parseTimeToMinutes(openEnd);
  const durationMins = CAFE_STANDARD_SHIFT_HOURS * 60;

  return {
    morning: {
      start: openStart,
      end: formatMinutesToTime(startMins + durationMins),
    },
    evening: {
      start: formatMinutesToTime(endMins - durationMins),
      end: openEnd,
    },
  };
}

export function formatCafeShiftWindowRange(window: CafeShiftWindow): string {
  return `${window.start} – ${window.end}`;
}

export function formatCafeShiftWindowLabel(
  shiftType: 'MORNING' | 'EVENING',
  windows: CafeShiftWindows,
): string {
  const window = shiftType === 'MORNING' ? windows.morning : windows.evening;
  const short = shiftType === 'MORNING' ? 'AM' : 'PM';
  return `${short} · ${formatCafeShiftWindowRange(window)}`;
}
