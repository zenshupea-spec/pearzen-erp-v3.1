const COLOMBO_TZ = 'Asia/Colombo';

export type ShiftType = 'DAY' | 'NIGHT';

export type ShiftStartTimes = {
  DAY: string;
  NIGHT: string;
};

export function colomboTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COLOMBO_TZ }).format(now);
}

export function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffCalendarDays(fromIso: string, toIso: string): number {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toIso) - parse(fromIso)) / 86_400_000);
}

function colomboToUTC(timeStr: string): { hour: number; minute: number } | null {
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const localHour = parseInt(parts[0], 10);
  const localMinute = parseInt(parts[1], 10);
  if (Number.isNaN(localHour) || Number.isNaN(localMinute)) return null;

  let utcMinute = localMinute - 30;
  let utcHour = localHour - 5;
  if (utcMinute < 0) {
    utcMinute += 60;
    utcHour -= 1;
  }
  if (utcHour < 0) {
    utcHour += 24;
  }
  return { hour: utcHour, minute: utcMinute };
}

export function getShiftStartUTC(
  shiftDate: string,
  shiftType: ShiftType,
  startTimes: ShiftStartTimes,
): Date | null {
  const timeStr = startTimes[shiftType];
  if (!timeStr) return null;
  const utc = colomboToUTC(timeStr);
  if (!utc) return null;
  const dt = new Date(`${shiftDate}T00:00:00Z`);
  dt.setUTCHours(utc.hour, utc.minute, 0, 0);
  return dt;
}

export function getShiftEndUTC(
  shiftDate: string,
  shiftType: ShiftType,
  startTimes: ShiftStartTimes & { dayEnd?: string; nightEnd?: string },
): Date | null {
  const timeStr =
    shiftType === 'DAY'
      ? startTimes.dayEnd ?? '19:00'
      : startTimes.nightEnd ?? '07:00';
  const utc = colomboToUTC(timeStr);
  if (!utc) return null;

  let endDate = shiftDate;
  if (shiftType === 'NIGHT') {
    const nightStart = getShiftStartUTC(shiftDate, 'NIGHT', startTimes);
    const end = new Date(`${shiftDate}T00:00:00Z`);
    end.setUTCHours(utc.hour, utc.minute, 0, 0);
    if (nightStart && end <= nightStart) {
      endDate = addCalendarDays(shiftDate, 1);
    }
    const dt = new Date(`${endDate}T00:00:00Z`);
    dt.setUTCHours(utc.hour, utc.minute, 0, 0);
    return dt;
  }

  const dt = new Date(`${endDate}T00:00:00Z`);
  dt.setUTCHours(utc.hour, utc.minute, 0, 0);
  return dt;
}

export function isNowWithinShiftWindow(
  shiftDate: string,
  shiftType: ShiftType,
  startTimes: ShiftStartTimes & { dayEnd?: string; nightEnd?: string },
  now = new Date(),
): boolean {
  const start = getShiftStartUTC(shiftDate, shiftType, startTimes);
  const end = getShiftEndUTC(shiftDate, shiftType, startTimes);
  if (!start || !end) return false;
  return now >= start && now <= end;
}

/** Guard attendance may be filed up to 3 days ahead, or for yesterday's night shift while it is still running. */
export function isShiftDateSubmittable(
  shiftDate: string,
  shiftType: ShiftType,
  startTimes: ShiftStartTimes & { dayEnd?: string; nightEnd?: string },
  now = new Date(),
): boolean {
  const todayIso = colomboTodayIso(now);
  const diff = diffCalendarDays(shiftDate, todayIso);

  if (diff > 3) return false;
  if (diff >= 0) return true;

  if (diff === -1 && shiftType === 'NIGHT') {
    return isNowWithinShiftWindow(shiftDate, 'NIGHT', startTimes, now);
  }

  return false;
}

export function formatColomboDayLabel(iso: string, now = new Date()): string {
  const todayIso = colomboTodayIso(now);
  const tomorrowIso = addCalendarDays(todayIso, 1);
  const yesterdayIso = addCalendarDays(todayIso, -1);

  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${iso}T12:00:00Z`));

  if (iso === todayIso) return `Today · ${weekday}`;
  if (iso === tomorrowIso) return `Tomorrow · ${weekday}`;
  if (iso === yesterdayIso) return `Last night · ${weekday}`;

  const long = new Intl.DateTimeFormat('en-GB', {
    timeZone: COLOMBO_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${iso}T12:00:00Z`));
  return long;
}

export function buildSelectableShiftDates(
  shiftType: ShiftType,
  startTimes: ShiftStartTimes & { dayEnd?: string; nightEnd?: string },
  now = new Date(),
): { iso: string; label: string }[] {
  const todayIso = colomboTodayIso(now);
  const options: { iso: string; label: string }[] = [];
  const seen = new Set<string>();

  const push = (iso: string, label?: string) => {
    if (seen.has(iso)) return;
    seen.add(iso);
    options.push({ iso, label: label ?? formatColomboDayLabel(iso, now) });
  };

  if (
    shiftType === 'NIGHT' &&
    isNowWithinShiftWindow(addCalendarDays(todayIso, -1), 'NIGHT', startTimes, now)
  ) {
    push(addCalendarDays(todayIso, -1), `Last night · ongoing`);
  }

  for (let i = 0; i < 4; i += 1) {
    push(addCalendarDays(todayIso, i));
  }

  return options;
}
