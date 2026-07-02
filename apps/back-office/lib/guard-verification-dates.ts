const COLOMBO_TZ = 'Asia/Colombo';

export function colomboTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COLOMBO_TZ }).format(now);
}

export function shiftDateFromDeviceTime(deviceTime: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COLOMBO_TZ }).format(
    new Date(deviceTime),
  );
}

export function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function colomboDayRange(dateIso: string): { start: string; end: string } {
  const next = addCalendarDays(dateIso, 1);
  return {
    start: `${dateIso}T00:00:00+05:30`,
    end: `${next}T00:00:00+05:30`,
  };
}
