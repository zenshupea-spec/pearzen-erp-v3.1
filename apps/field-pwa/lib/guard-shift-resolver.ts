import type { SupabaseClient } from '@supabase/supabase-js';

export type VerificationMode = 'A' | 'B' | 'C';
export type ShiftType = 'DAY' | 'NIGHT';

export type GuardEmployeeRow = {
  id: string;
  full_name: string | null;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | number | null;
  company_id: string | null;
};

export type ResolvedGuardShift = {
  shiftId: string;
  source: 'time_rosters' | 'sm_guard_attendance';
  shiftDate: string;
  plannedStartTime: string;
  plannedEndTime: string;
  siteName: string;
  siteLat: number | null;
  siteLng: number | null;
  geofenceRadius: number;
  verificationMode: VerificationMode;
  nfcTagId: string | null;
};

type SiteProfileRow = Record<string, unknown> & {
  site_name?: string;
};

type ShiftStartTimes = {
  DAY: string;
  NIGHT: string;
  dayEnd?: string;
  nightEnd?: string;
};

const COLOMBO_TZ = 'Asia/Colombo';

export function colomboTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COLOMBO_TZ }).format(now);
}

function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickCoord(row: SiteProfileRow, keys: string[]): number | null {
  for (const key of keys) {
    if (key in row) {
      const parsed = toNumberOrNull(row[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

export function parseSiteProfile(raw: SiteProfileRow | SiteProfileRow[] | null | undefined) {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row) {
    return {
      siteName: 'UNKNOWN SITE',
      siteLat: null as number | null,
      siteLng: null as number | null,
      geofenceRadius: 25,
      verificationMode: 'B' as VerificationMode,
      nfcTagId: null as string | null,
    };
  }

  const mode = String(row.verification_mode ?? 'B').toUpperCase();
  const verificationMode: VerificationMode =
    mode === 'A' || mode === 'C' ? mode : 'B';

  return {
    siteName: String(row.site_name ?? 'UNKNOWN SITE'),
    siteLat: pickCoord(row, ['latitude', 'lat', 'site_lat', 'site_latitude']),
    siteLng: pickCoord(row, ['longitude', 'lng', 'site_lng', 'site_longitude']),
    geofenceRadius:
      pickCoord(row, ['geofence_radius', 'radius_meters', 'gps_radius_meters']) ?? 25,
    verificationMode,
    nfcTagId: row.nfc_tag_id ? String(row.nfc_tag_id) : null,
  };
}

export function guardEpfKeys(employee: GuardEmployeeRow): string[] {
  const keys = new Set<string>();
  if (employee.emp_number) keys.add(String(employee.emp_number).trim().toUpperCase());
  if (employee.epf_no) keys.add(String(employee.epf_no).trim().toUpperCase());
  if (employee.epf_num != null) keys.add(String(employee.epf_num).trim().toUpperCase());
  return [...keys].filter(Boolean);
}

export async function findActiveEmployeeByRosterKey(
  supabase: SupabaseClient,
  rosterKey: string,
): Promise<GuardEmployeeRow | null> {
  const trimmed = rosterKey.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  const select =
    'id, full_name, emp_number, epf_no, epf_num, company_id, status';

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
        full_name: (data.full_name as string | null) ?? null,
        emp_number: (data.emp_number as string | null) ?? null,
        epf_no: (data.epf_no as string | null) ?? null,
        epf_num: (data.epf_num as string | number | null) ?? null,
        company_id: (data.company_id as string | null) ?? null,
      };
    }
  }

  return null;
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

function isNowWithinShiftWindow(
  shiftDate: string,
  shiftType: ShiftType,
  startTimes: ShiftStartTimes,
  now = new Date(),
): boolean {
  const start = getShiftStartUTC(shiftDate, shiftType, startTimes);
  const end = getShiftEndUTC(shiftDate, shiftType, startTimes);
  if (!start || !end) return false;
  return now >= start && now <= end;
}

export async function fetchSecurityShiftTiming(
  supabase: SupabaseClient,
): Promise<ShiftStartTimes> {
  const { data } = await supabase
    .from('md_settings')
    .select('security_day_start, security_day_end, security_night_start, security_night_end')
    .limit(1)
    .maybeSingle();

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

async function fetchSiteProfileByName(
  supabase: SupabaseClient,
  siteName: string,
  companyId: string | null,
) {
  let query = supabase
    .from('site_profiles')
    .select(
      'site_name, latitude, longitude, lat, lng, geofence_radius, radius_meters, verification_mode, nfc_tag_id',
    )
    .eq('site_name', siteName)
    .limit(1);

  if (companyId) query = query.eq('company_id', companyId);

  const { data } = await query.maybeSingle();
  return parseSiteProfile(data as SiteProfileRow | null);
}

async function resolveFromTimeRosters(
  supabase: SupabaseClient,
  employeeId: string,
  today: string,
): Promise<ResolvedGuardShift | null> {
  const { data: rows, error } = await supabase
    .from('time_rosters')
    .select(`
      id,
      shift_date,
      planned_start_time,
      planned_end_time,
      site_profiles (
        site_name,
        latitude,
        longitude,
        lat,
        lng,
        geofence_radius,
        radius_meters,
        verification_mode,
        nfc_tag_id
      )
    `)
    .eq('employee_id', employeeId)
    .eq('shift_date', today)
    .eq('status', 'ACTIVE')
    .order('planned_start_time', { ascending: true });

  if (error || !rows?.length) return null;

  const shift = rows[0];
  const siteInfo = parseSiteProfile(
    (shift as { site_profiles?: SiteProfileRow | SiteProfileRow[] }).site_profiles,
  );

  return {
    shiftId: shift.id,
    source: 'time_rosters',
    shiftDate: shift.shift_date,
    plannedStartTime: shift.planned_start_time,
    plannedEndTime: shift.planned_end_time,
    siteName: siteInfo.siteName,
    siteLat: siteInfo.siteLat,
    siteLng: siteInfo.siteLng,
    geofenceRadius: siteInfo.geofenceRadius,
    verificationMode: siteInfo.verificationMode,
    nfcTagId: siteInfo.nfcTagId,
  };
}

type SmAttendanceRow = {
  id: string;
  shift_date: string;
  shift_type: ShiftType;
  site_name: string;
};

async function resolveFromSmGuardAttendance(
  supabase: SupabaseClient,
  employee: GuardEmployeeRow,
  today: string,
  startTimes: ShiftStartTimes,
  now = new Date(),
): Promise<ResolvedGuardShift | null> {
  const epfKeys = guardEpfKeys(employee);
  if (epfKeys.length === 0) return null;

  const dates = [today];
  const yesterday = addCalendarDays(today, -1);
  if (isNowWithinShiftWindow(yesterday, 'NIGHT', startTimes, now)) {
    dates.unshift(yesterday);
  }

  const { data: rows, error } = await supabase
    .from('sm_guard_attendance')
    .select('id, shift_date, shift_type, site_name')
    .in('guard_epf', epfKeys)
    .in('shift_date', dates)
    .neq('status', 'CANCELLED');

  if (error || !rows?.length) return null;

  const candidates = (rows as SmAttendanceRow[])
    .map((row) => {
      const shiftType = (row.shift_type === 'NIGHT' ? 'NIGHT' : 'DAY') as ShiftType;
      const start = getShiftStartUTC(row.shift_date, shiftType, startTimes);
      const end = getShiftEndUTC(row.shift_date, shiftType, startTimes);
      return { row, shiftType, start, end };
    })
    .filter((item) => item.start && item.end)
    .sort((a, b) => (a.start!.getTime() - b.start!.getTime()));

  if (!candidates.length) return null;

  const active =
    candidates.find(
      (item) => item.start && item.end && now >= item.start && now <= item.end,
    ) ??
    candidates.find((item) => item.start && now < item.start!) ??
    candidates[candidates.length - 1];

  const { row, shiftType, start, end } = active;
  if (!start || !end) return null;

  const siteInfo = await fetchSiteProfileByName(
    supabase,
    row.site_name,
    employee.company_id,
  );

  return {
    shiftId: `sm:${row.id}`,
    source: 'sm_guard_attendance',
    shiftDate: row.shift_date,
    plannedStartTime: start.toISOString(),
    plannedEndTime: end.toISOString(),
    siteName: siteInfo.siteName !== 'UNKNOWN SITE' ? siteInfo.siteName : row.site_name,
    siteLat: siteInfo.siteLat,
    siteLng: siteInfo.siteLng,
    geofenceRadius: siteInfo.geofenceRadius,
    verificationMode: siteInfo.verificationMode,
    nfcTagId: siteInfo.nfcTagId,
  };
}

export async function resolveActiveShiftForToday(
  supabase: SupabaseClient,
  rosterKey: string,
  now = new Date(),
): Promise<{ employee: GuardEmployeeRow; shift: ResolvedGuardShift } | null> {
  const employee = await findActiveEmployeeByRosterKey(supabase, rosterKey);
  if (!employee) return null;

  const today = colomboTodayIso(now);
  const rosterShift = await resolveFromTimeRosters(supabase, employee.id, today);
  if (rosterShift) return { employee, shift: rosterShift };

  const startTimes = await fetchSecurityShiftTiming(supabase);
  const smShift = await resolveFromSmGuardAttendance(
    supabase,
    employee,
    today,
    startTimes,
    now,
  );
  if (smShift) return { employee, shift: smShift };

  return null;
}

export async function resolveUpcomingShifts(
  supabase: SupabaseClient,
  rosterKey: string,
  limit = 14,
): Promise<ResolvedGuardShift[]> {
  const employee = await findActiveEmployeeByRosterKey(supabase, rosterKey);
  if (!employee) return [];

  const today = colomboTodayIso();
  const startTimes = await fetchSecurityShiftTiming(supabase);
  const shifts: ResolvedGuardShift[] = [];

  const { data: rosterRows } = await supabase
    .from('time_rosters')
    .select(`
      id,
      shift_date,
      planned_start_time,
      planned_end_time,
      site_profiles (
        site_name,
        latitude,
        longitude,
        lat,
        lng,
        geofence_radius,
        radius_meters,
        verification_mode,
        nfc_tag_id
      )
    `)
    .eq('employee_id', employee.id)
    .eq('status', 'ACTIVE')
    .gte('shift_date', today)
    .order('shift_date', { ascending: true })
    .order('planned_start_time', { ascending: true })
    .limit(limit);

  for (const shift of rosterRows ?? []) {
    const siteInfo = parseSiteProfile(
      (shift as { site_profiles?: SiteProfileRow | SiteProfileRow[] }).site_profiles,
    );
    shifts.push({
      shiftId: shift.id,
      source: 'time_rosters',
      shiftDate: shift.shift_date,
      plannedStartTime: shift.planned_start_time,
      plannedEndTime: shift.planned_end_time,
      siteName: siteInfo.siteName,
      siteLat: siteInfo.siteLat,
      siteLng: siteInfo.siteLng,
      geofenceRadius: siteInfo.geofenceRadius,
      verificationMode: siteInfo.verificationMode,
      nfcTagId: siteInfo.nfcTagId,
    });
  }

  const epfKeys = guardEpfKeys(employee);
  if (epfKeys.length > 0) {
    const endDate = addCalendarDays(today, 14);
    const { data: smRows } = await supabase
      .from('sm_guard_attendance')
      .select('id, shift_date, shift_type, site_name')
      .in('guard_epf', epfKeys)
      .gte('shift_date', today)
      .lte('shift_date', endDate)
      .neq('status', 'CANCELLED')
      .order('shift_date', { ascending: true });

    for (const row of smRows ?? []) {
      const shiftType = (row.shift_type === 'NIGHT' ? 'NIGHT' : 'DAY') as ShiftType;
      const start = getShiftStartUTC(row.shift_date, shiftType, startTimes);
      const end = getShiftEndUTC(row.shift_date, shiftType, startTimes);
      if (!start || !end) continue;

      const siteInfo = await fetchSiteProfileByName(
        supabase,
        row.site_name,
        employee.company_id,
      );

      shifts.push({
        shiftId: `sm:${row.id}`,
        source: 'sm_guard_attendance',
        shiftDate: row.shift_date,
        plannedStartTime: start.toISOString(),
        plannedEndTime: end.toISOString(),
        siteName: siteInfo.siteName !== 'UNKNOWN SITE' ? siteInfo.siteName : row.site_name,
        siteLat: siteInfo.siteLat,
        siteLng: siteInfo.siteLng,
        geofenceRadius: siteInfo.geofenceRadius,
        verificationMode: siteInfo.verificationMode,
        nfcTagId: siteInfo.nfcTagId,
      });
    }
  }

  shifts.sort(
    (a, b) =>
      a.shiftDate.localeCompare(b.shiftDate) ||
      a.plannedStartTime.localeCompare(b.plannedStartTime),
  );

  const seen = new Set<string>();
  const deduped: ResolvedGuardShift[] = [];
  for (const shift of shifts) {
    const key = `${shift.shiftDate}|${shift.siteName}|${shift.plannedStartTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(shift);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

export async function countRosteredShiftsForToday(
  supabase: SupabaseClient,
  employee: GuardEmployeeRow,
  today: string,
): Promise<number> {
  const { count: rosterCount } = await supabase
    .from('time_rosters')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employee.id)
    .eq('shift_date', today)
    .eq('status', 'ACTIVE');

  if ((rosterCount ?? 0) > 0) return rosterCount ?? 0;

  const epfKeys = guardEpfKeys(employee);
  if (epfKeys.length === 0) return 0;

  const { count: smCount } = await supabase
    .from('sm_guard_attendance')
    .select('id', { count: 'exact', head: true })
    .in('guard_epf', epfKeys)
    .eq('shift_date', today)
    .neq('status', 'CANCELLED');

  return smCount ?? 0;
}
