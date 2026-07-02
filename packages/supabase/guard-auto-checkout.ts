import type { SupabaseClient } from '@supabase/supabase-js';

export const AUTO_CHECKOUT_SYNC_TYPE = 'AUTO_CHECKOUT';
const AUTO_CHECKOUT_DELAY_MS = 60 * 60 * 1000;
const BACK_TO_BACK_GRACE_MS = 5 * 60 * 1000;
/** Max time to defer auto-checkout when a back-to-back SM shift exists on the same site. */
const BACK_TO_BACK_DEFER_MS = 2 * 60 * 60 * 1000;
const COLOMBO_TZ = 'Asia/Colombo';

export type ShiftType = 'DAY' | 'NIGHT';

type ShiftStartTimes = {
  DAY: string;
  NIGHT: string;
  dayEnd?: string;
  nightEnd?: string;
};

type GuardEmployeeRow = {
  id: string;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | number | null;
  company_id: string | null;
};

export type ResolvedGuardShiftWindow = {
  shiftId: string;
  shiftDate: string;
  shiftType: ShiftType;
  plannedStartTime: string;
  plannedEndTime: string;
  siteName: string;
};

type OpenCheckIn = {
  id: string;
  device_time: string;
  latitude: number | null;
  longitude: number | null;
  guard_id: string | null;
  site_profile_id: string | null;
  shift_date: string | null;
};

function colomboTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COLOMBO_TZ }).format(now);
}

function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
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
  if (utcHour < 0) utcHour += 24;
  return { hour: utcHour, minute: utcMinute };
}

function getShiftStartUTC(
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

function getShiftEndUTC(
  shiftDate: string,
  shiftType: ShiftType,
  startTimes: ShiftStartTimes,
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

async function fetchSecurityShiftTiming(
  supabase: SupabaseClient,
  companyId?: string | null,
): Promise<ShiftStartTimes> {
  const select =
    'security_day_start, security_day_end, security_night_start, security_night_end';

  if (companyId) {
    const { data } = await supabase
      .from('md_settings')
      .select(select)
      .eq('company_id', companyId)
      .maybeSingle();
    if (data) {
      const row = data as {
        security_day_start?: string | null;
        security_day_end?: string | null;
        security_night_start?: string | null;
        security_night_end?: string | null;
      };
      return {
        DAY: row.security_day_start ?? '07:00',
        NIGHT: row.security_night_start ?? '19:00',
        dayEnd: row.security_day_end ?? '19:00',
        nightEnd: row.security_night_end ?? '07:00',
      };
    }
  }

  const { data } = await supabase.from('md_settings').select(select).limit(1).maybeSingle();

  const row = data as {
    security_day_start?: string | null;
    security_day_end?: string | null;
    security_night_start?: string | null;
    security_night_end?: string | null;
  } | null;

  return {
    DAY: row?.security_day_start ?? '07:00',
    NIGHT: row?.security_night_start ?? '19:00',
    dayEnd: row?.security_day_end ?? '19:00',
    nightEnd: row?.security_night_end ?? '07:00',
  };
}

function guardEpfKeys(employee: GuardEmployeeRow): string[] {
  const keys = new Set<string>();
  if (employee.emp_number) keys.add(String(employee.emp_number).trim().toUpperCase());
  if (employee.epf_no) keys.add(String(employee.epf_no).trim().toUpperCase());
  if (employee.epf_num != null) keys.add(String(employee.epf_num).trim().toUpperCase());
  return [...keys].filter(Boolean);
}

async function findActiveEmployeeByRosterKey(
  supabase: SupabaseClient,
  rosterKey: string,
): Promise<GuardEmployeeRow | null> {
  const trimmed = rosterKey.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  const select = 'id, emp_number, epf_no, epf_num, company_id, status';

  for (const [column, value] of [
    ['emp_number', upper],
    ['epf_no', trimmed],
    ['epf_num', trimmed],
  ] as const) {
    const { data, error } = await supabase
      .from('employees')
      .select(select)
      .eq(column, value)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (!error && data && typeof data.id === 'string') {
      return {
        id: data.id,
        emp_number: (data.emp_number as string | null) ?? null,
        epf_no: (data.epf_no as string | null) ?? null,
        epf_num: (data.epf_num as string | number | null) ?? null,
        company_id: (data.company_id as string | null) ?? null,
      };
    }
  }

  return null;
}

function normalizeSiteName(name: string): string {
  return name.trim().toUpperCase();
}

function inferShiftTypeFromStart(
  plannedStartIso: string,
  startTimes: ShiftStartTimes,
): ShiftType {
  const checkIn = new Date(plannedStartIso);
  const shiftDate = plannedStartIso.slice(0, 10);
  const dayStart = getShiftStartUTC(shiftDate, 'DAY', startTimes);
  const nightStart = getShiftStartUTC(shiftDate, 'NIGHT', startTimes);
  if (!dayStart || !nightStart) return 'DAY';

  const toDay = Math.abs(checkIn.getTime() - dayStart.getTime());
  const toNight = Math.abs(checkIn.getTime() - nightStart.getTime());
  return toDay <= toNight ? 'DAY' : 'NIGHT';
}

function buildShiftWindow(
  shiftId: string,
  shiftDate: string,
  shiftType: ShiftType,
  siteName: string,
  startTimes: ShiftStartTimes,
): ResolvedGuardShiftWindow | null {
  const start = getShiftStartUTC(shiftDate, shiftType, startTimes);
  const end = getShiftEndUTC(shiftDate, shiftType, startTimes);
  if (!start || !end) return null;

  return {
    shiftId,
    shiftDate,
    shiftType,
    plannedStartTime: start.toISOString(),
    plannedEndTime: end.toISOString(),
    siteName,
  };
}

async function resolveShiftAtCheckIn(
  supabase: SupabaseClient,
  employee: GuardEmployeeRow,
  checkInTime: Date,
): Promise<ResolvedGuardShiftWindow | null> {
  const startTimes = await fetchSecurityShiftTiming(supabase, employee.company_id);
  const shiftDate = colomboTodayIso(checkInTime);
  const rosterDates = [shiftDate, addCalendarDays(shiftDate, -1)];

  const { data: rosterRows } = await supabase
    .from('time_rosters')
    .select(`
      id,
      shift_date,
      planned_start_time,
      site_profiles ( site_name )
    `)
    .eq('employee_id', employee.id)
    .in('shift_date', rosterDates)
    .eq('status', 'ACTIVE')
    .order('shift_date', { ascending: false })
    .order('planned_start_time', { ascending: true });

  for (const row of rosterRows ?? []) {
    const rowDate = String(row.shift_date);
    const siteProfiles = row.site_profiles as { site_name?: string } | { site_name?: string }[] | null;
    const siteRow = Array.isArray(siteProfiles) ? siteProfiles[0] : siteProfiles;
    const siteName = String(siteRow?.site_name ?? 'UNKNOWN SITE');
    const shiftType = inferShiftTypeFromStart(String(row.planned_start_time), startTimes);
    const start = getShiftStartUTC(rowDate, shiftType, startTimes);
    const end = getShiftEndUTC(rowDate, shiftType, startTimes);
    if (!start || !end) continue;
    if (checkInTime >= start && checkInTime <= end) {
      return buildShiftWindow(String(row.id), rowDate, shiftType, siteName, startTimes);
    }
  }

  const epfKeys = guardEpfKeys(employee);
  if (epfKeys.length === 0) return null;

  const dates = [shiftDate, addCalendarDays(shiftDate, -1)];
  const { data: smRows } = await supabase
    .from('sm_guard_attendance')
    .select('id, shift_date, shift_type, site_name')
    .in('guard_epf', epfKeys)
    .in('shift_date', dates)
    .neq('status', 'CANCELLED');

  for (const row of smRows ?? []) {
    const shiftType = (row.shift_type === 'NIGHT' ? 'NIGHT' : 'DAY') as ShiftType;
    const start = getShiftStartUTC(row.shift_date, shiftType, startTimes);
    const end = getShiftEndUTC(row.shift_date, shiftType, startTimes);
    if (!start || !end) continue;
    if (checkInTime >= start && checkInTime <= end) {
      return buildShiftWindow(
        `sm:${row.id}`,
        row.shift_date,
        shiftType,
        String(row.site_name),
        startTimes,
      );
    }
  }

  return null;
}

async function hasBackToBackSmShiftOnSameSite(
  supabase: SupabaseClient,
  employee: GuardEmployeeRow,
  shift: ResolvedGuardShiftWindow,
  startTimes: ShiftStartTimes,
): Promise<boolean> {
  const epfKeys = guardEpfKeys(employee);
  if (!epfKeys.length) return false;

  const currentEnd = new Date(shift.plannedEndTime);
  const searchDates = [
    shift.shiftDate,
    addCalendarDays(shift.shiftDate, -1),
    addCalendarDays(shift.shiftDate, 1),
  ];

  const { data: rows } = await supabase
    .from('sm_guard_attendance')
    .select('shift_date, shift_type, site_name')
    .in('guard_epf', epfKeys)
    .in('shift_date', searchDates)
    .neq('status', 'CANCELLED');

  const siteNorm = normalizeSiteName(shift.siteName);

  for (const row of rows ?? []) {
    if (normalizeSiteName(String(row.site_name)) !== siteNorm) continue;

    const nextType = (row.shift_type === 'NIGHT' ? 'NIGHT' : 'DAY') as ShiftType;
    if (row.shift_date === shift.shiftDate && nextType === shift.shiftType) {
      continue;
    }

    const nextStart = getShiftStartUTC(row.shift_date, nextType, startTimes);
    if (!nextStart) continue;

    const delta = nextStart.getTime() - currentEnd.getTime();
    if (delta >= -BACK_TO_BACK_GRACE_MS && delta <= BACK_TO_BACK_GRACE_MS) {
      return true;
    }
  }

  return false;
}

export async function findOpenCheckIn(
  supabase: SupabaseClient,
  empNumber: string,
): Promise<OpenCheckIn | null> {
  const { data: lastLog } = await supabase
    .from('attendance_logs')
    .select(
      'id, action_type, device_time, latitude, longitude, guard_id, site_profile_id, shift_date',
    )
    .eq('emp_number', empNumber)
    .order('device_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastLog || lastLog.action_type !== 'CHECK_IN') return null;

  const { data: checkoutAfter } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('emp_number', empNumber)
    .eq('action_type', 'CHECK_OUT')
    .gt('device_time', lastLog.device_time as string)
    .limit(1);

  if (checkoutAfter?.length) return null;

  return {
    id: String(lastLog.id),
    device_time: String(lastLog.device_time),
    latitude: lastLog.latitude == null ? null : Number(lastLog.latitude),
    longitude: lastLog.longitude == null ? null : Number(lastLog.longitude),
    guard_id: lastLog.guard_id ? String(lastLog.guard_id) : null,
    site_profile_id: lastLog.site_profile_id ? String(lastLog.site_profile_id) : null,
    shift_date: lastLog.shift_date ? String(lastLog.shift_date) : null,
  };
}

/**
 * If a guard stayed checked in 1h past MD shift end with no back-to-back SM shift on the
 * same site, insert a synthetic FLAGGED check-out for OM review.
 */
export async function maybeAutoCheckoutGuard(
  supabase: SupabaseClient,
  empNumber: string,
  now = new Date(),
): Promise<{ applied: boolean }> {
  const openCheckIn = await findOpenCheckIn(supabase, empNumber);
  if (!openCheckIn) return { applied: false };

  const employee = await findActiveEmployeeByRosterKey(supabase, empNumber);
  if (!employee) return { applied: false };

  const checkInMs = new Date(openCheckIn.device_time).getTime();
  const shift = await resolveShiftAtCheckIn(
    supabase,
    employee,
    new Date(openCheckIn.device_time),
  );

  let checkoutTimeIso: string;

  if (shift) {
    const autoDueAt =
      new Date(shift.plannedEndTime).getTime() + AUTO_CHECKOUT_DELAY_MS;
    if (now.getTime() < autoDueAt) return { applied: false };

    const startTimes = await fetchSecurityShiftTiming(supabase, employee.company_id);
    const backToBackDeferUntil =
      new Date(shift.plannedEndTime).getTime() + BACK_TO_BACK_DEFER_MS;
    if (
      now.getTime() < backToBackDeferUntil &&
      (await hasBackToBackSmShiftOnSameSite(supabase, employee, shift, startTimes))
    ) {
      return { applied: false };
    }

    checkoutTimeIso = new Date(autoDueAt).toISOString();
  } else {
    // Roster anchor missing — safety valve so open check-ins cannot live forever.
    const staleAfterMs =
      AUTO_CHECKOUT_DELAY_MS + BACK_TO_BACK_DEFER_MS + 12 * 60 * 60 * 1000;
    if (now.getTime() - checkInMs < staleAfterMs) return { applied: false };
    checkoutTimeIso = now.toISOString();
  }

  const { data: existingAuto } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('emp_number', empNumber)
    .eq('action_type', 'CHECK_OUT')
    .eq('sync_type', AUTO_CHECKOUT_SYNC_TYPE)
    .gt('device_time', openCheckIn.device_time)
    .limit(1);

  if (existingAuto?.length) return { applied: false };

  const { error } = await supabase.from('attendance_logs').insert({
    emp_number: empNumber,
    action_type: 'CHECK_OUT',
    device_time: checkoutTimeIso,
    latitude: openCheckIn.latitude,
    longitude: openCheckIn.longitude,
    sync_type: AUTO_CHECKOUT_SYNC_TYPE,
    photo_url: null,
    status: 'FLAGGED',
    company_id: employee.company_id,
    guard_id: openCheckIn.guard_id ?? employee.id,
    shift_date: openCheckIn.shift_date ?? shift?.shiftDate ?? null,
    site_profile_id: openCheckIn.site_profile_id,
  });

  if (error) {
    console.error('guard auto-checkout insert failed:', error.message);
    return { applied: false };
  }

  return { applied: true };
}

/** Run auto-checkout sweep for guards with a recent open check-in. */
export async function sweepMissedGuardCheckouts(
  supabase: SupabaseClient,
  now = new Date(),
  companyId?: string | null,
): Promise<number> {
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('attendance_logs')
    .select('emp_number')
    .eq('action_type', 'CHECK_IN')
    .gte('device_time', cutoff);

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error || !data?.length) return 0;

  const empNumbers = [...new Set(data.map((row) => String(row.emp_number)))];
  let applied = 0;

  for (const empNumber of empNumbers) {
    const result = await maybeAutoCheckoutGuard(supabase, empNumber, now);
    if (result.applied) applied += 1;
  }

  return applied;
}
