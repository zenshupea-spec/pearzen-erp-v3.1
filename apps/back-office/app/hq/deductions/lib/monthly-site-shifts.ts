import type { SupabaseClient } from '@supabase/supabase-js';
import { shiftDateFromDeviceTime } from '../../../../lib/guard-verification-query';
import { payrollMonthDateRange } from './payroll-month';

export type GuardEmpRow = {
  id: string;
  emp_number: string | null;
  epf_no?: string | null;
  epf_num?: string | number | null;
};

export type MonthlySiteShiftRollup = {
  /** siteKey (lowercase trimmed name) → employeeId → deduped shift slot count */
  shiftCountBySite: Map<string, Map<string, number>>;
  /** siteKey → display label */
  siteNameByKey: Map<string, string>;
};

function siteKeyFromName(name: string): string {
  return name.trim().toLowerCase();
}

export function guardEpfKeys(emp: GuardEmpRow): string[] {
  const keys = new Set<string>();
  if (emp.emp_number) keys.add(String(emp.emp_number).trim());
  if (emp.epf_no) keys.add(String(emp.epf_no).trim());
  if (emp.epf_num != null) keys.add(String(emp.epf_num).trim());
  return [...keys].filter(Boolean);
}

function parseSiteNameFromRelation(
  sp: { site_name?: string } | { site_name?: string }[] | null,
): string | null {
  const row = Array.isArray(sp) ? sp[0] : sp;
  const name = row?.site_name?.trim();
  return name || null;
}

type ShiftAccumulator = Map<string, Map<string, Set<string>>>;

function recordShiftSlot(
  acc: ShiftAccumulator,
  siteName: string,
  employeeId: string,
  slotKey: string,
  siteNameByKey: Map<string, string>,
) {
  const trimmed = siteName.trim();
  if (!trimmed) return;
  const siteKey = siteKeyFromName(trimmed);
  if (!siteNameByKey.has(siteKey)) siteNameByKey.set(siteKey, trimmed);

  let byEmployee = acc.get(siteKey);
  if (!byEmployee) {
    byEmployee = new Map();
    acc.set(siteKey, byEmployee);
  }
  let slots = byEmployee.get(employeeId);
  if (!slots) {
    slots = new Set();
    byEmployee.set(employeeId, slots);
  }
  slots.add(slotKey);
}

function rollupFromAccumulator(acc: ShiftAccumulator): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [siteKey, byEmployee] of acc) {
    const counts = new Map<string, number>();
    for (const [employeeId, slots] of byEmployee) {
      counts.set(employeeId, slots.size);
    }
    out.set(siteKey, counts);
  }
  return out;
}

type AttendanceSiteJoin = { site_name?: string; verification_mode?: string };

function parseAttendanceSiteJoin(
  raw: AttendanceSiteJoin | AttendanceSiteJoin[] | null | undefined,
): AttendanceSiteJoin | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row ?? null;
}

function isCheckInPayrollMode(mode: string | null | undefined): boolean {
  const raw = String(mode ?? 'B').toUpperCase();
  return raw === 'B' || raw === 'C';
}

async function loadSiteVerificationModeByKey(
  supabase: SupabaseClient,
  companyId: string | null,
): Promise<Map<string, string>> {
  let query = supabase.from('site_profiles').select('site_name, verification_mode');
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    console.error('❌ Shift rollup (site_profiles):', error.message);
    return new Map();
  }
  const modes = new Map<string, string>();
  for (const row of data ?? []) {
    const name = String(row.site_name ?? '').trim();
    if (!name) continue;
    modes.set(siteKeyFromName(name), String(row.verification_mode ?? 'B').toUpperCase());
  }
  return modes;
}

function siteAllowsCheckInPayrollSources(
  siteName: string,
  modeBySiteKey: Map<string, string>,
): boolean {
  return isCheckInPayrollMode(modeBySiteKey.get(siteKeyFromName(siteName)));
}

type ShiftTimingSettings = {
  security_day_start: string;
  security_day_end: string;
  security_night_start: string;
  security_night_end: string;
};

const DEFAULT_SHIFT_TIMING: ShiftTimingSettings = {
  security_day_start: '07:00',
  security_day_end: '19:00',
  security_night_start: '19:00',
  security_night_end: '07:00',
};

function canonicalShiftSlotKey(shiftDate: string, shiftType?: string | null): string {
  const type = String(shiftType ?? 'DAY').toUpperCase() === 'NIGHT' ? 'NIGHT' : 'DAY';
  return `${shiftDate}|${type}`;
}

function colomboToUtcParts(timeStr: string): { hour: number; minute: number } | null {
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

function mdTimeOnDate(shiftDate: string, timeStr: string): Date | null {
  const utc = colomboToUtcParts(timeStr);
  if (!utc) return null;
  const dt = new Date(`${shiftDate}T00:00:00Z`);
  dt.setUTCHours(utc.hour, utc.minute, 0, 0);
  return dt;
}

function inferShiftTypeFromCheckIn(
  checkInIso: string,
  settings: ShiftTimingSettings,
): 'DAY' | 'NIGHT' {
  const checkIn = new Date(checkInIso);
  const shiftDate = checkInIso.slice(0, 10);
  const dayStart = mdTimeOnDate(shiftDate, settings.security_day_start);
  const dayEnd = mdTimeOnDate(shiftDate, settings.security_day_end);
  if (dayStart && dayEnd && checkIn >= dayStart && checkIn < dayEnd) {
    return 'DAY';
  }
  return 'NIGHT';
}

async function loadShiftTimingSettings(
  supabase: SupabaseClient,
  companyId: string | null,
): Promise<ShiftTimingSettings> {
  let query = supabase
    .from('md_settings')
    .select('security_day_start, security_day_end, security_night_start, security_night_end')
    .limit(1);
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return DEFAULT_SHIFT_TIMING;
  return {
    security_day_start: String(data.security_day_start ?? DEFAULT_SHIFT_TIMING.security_day_start),
    security_day_end: String(data.security_day_end ?? DEFAULT_SHIFT_TIMING.security_day_end),
    security_night_start: String(
      data.security_night_start ?? DEFAULT_SHIFT_TIMING.security_night_start,
    ),
    security_night_end: String(data.security_night_end ?? DEFAULT_SHIFT_TIMING.security_night_end),
  };
}

function resolveShiftDateFromLog(row: {
  shift_date: string | null;
  device_time: string;
}): string | null {
  if (row.shift_date) return String(row.shift_date).slice(0, 10);
  if (!row.device_time) return null;
  return shiftDateFromDeviceTime(row.device_time);
}

function resolveEmployeeIdFromLog(
  row: { guard_id: string | null; emp_number: string },
  epfToEmployeeId: Map<string, string>,
  employeeIdSet: Set<string>,
): string | null {
  if (row.guard_id && employeeIdSet.has(String(row.guard_id))) {
    return String(row.guard_id);
  }
  const trimmed = String(row.emp_number ?? '').trim();
  return (
    epfToEmployeeId.get(trimmed) ??
    epfToEmployeeId.get(trimmed.toUpperCase()) ??
    null
  );
}

type ApprovedAttendancePair = {
  employeeId: string;
  siteName: string;
  siteProfileId: string | null;
  shiftDate: string;
  checkInDeviceTime: string;
};

async function listApprovedAttendanceShiftPairs(
  supabase: SupabaseClient,
  employeeIds: string[],
  employeeIdSet: Set<string>,
  epfToEmployeeId: Map<string, string>,
  start: string,
  end: string,
  companyId: string | null,
): Promise<ApprovedAttendancePair[]> {
  if (!employeeIds.length) return [];

  const epfList = [...epfToEmployeeId.keys()];
  let query = supabase
    .from('attendance_logs')
    .select(
      'guard_id, emp_number, action_type, device_time, status, shift_date, site_profile_id, site_profiles ( site_name, verification_mode )',
    )
    .eq('status', 'APPROVED')
    .in('action_type', ['CHECK_IN', 'CHECK_OUT']);

  if (employeeIds.length) {
    query = query.in('guard_id', employeeIds);
  } else if (epfList.length) {
    query = query.in('emp_number', epfList);
  } else {
    return [];
  }

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) {
    console.error('❌ Shift rollup (attendance_logs):', error.message);
    return [];
  }

  const checkIns = new Set<string>();
  const checkOuts = new Set<string>();
  const pairMeta = new Map<
    string,
    { employeeId: string; siteName: string; siteProfileId: string | null; shiftDate: string }
  >();

  for (const row of data ?? []) {
    const employeeId = resolveEmployeeIdFromLog(row, epfToEmployeeId, employeeIdSet);
    if (!employeeId) continue;

    const shiftDate = resolveShiftDateFromLog(row);
    if (!shiftDate || shiftDate < start || shiftDate > end) continue;

    const site = parseAttendanceSiteJoin(
      row.site_profiles as AttendanceSiteJoin | AttendanceSiteJoin[] | null,
    );
    const siteName = site?.site_name?.trim();
    if (!siteName || !isCheckInPayrollMode(site?.verification_mode)) continue;

    const pairKey = `${employeeId}::${shiftDate}::${siteKeyFromName(siteName)}`;
    if (row.action_type === 'CHECK_IN') {
      checkIns.add(pairKey);
      pairMeta.set(pairKey, {
        employeeId,
        siteName,
        siteProfileId: row.site_profile_id ? String(row.site_profile_id) : null,
        shiftDate,
        checkInDeviceTime: String(row.device_time),
      });
    } else {
      checkOuts.add(pairKey);
    }
  }

  const pairs: ApprovedAttendancePair[] = [];
  for (const pairKey of checkIns) {
    if (!checkOuts.has(pairKey)) continue;
    const meta = pairMeta.get(pairKey);
    if (meta) pairs.push(meta);
  }
  return pairs;
}

/** FM portfolio: APPROVED attendance pairs on Mode B/C sites → `employeeId:siteProfileId` counts. */
export async function fetchApprovedAttendanceShiftCountsForFm(
  supabase: SupabaseClient,
  guards: GuardEmpRow[],
  payrollMonthIso: string,
  companyId: string,
): Promise<Map<string, number>> {
  const { start, end } = payrollMonthDateRange(payrollMonthIso);
  const employeeIds = guards.map((g) => g.id);
  const employeeIdSet = new Set(employeeIds);
  const epfToEmployeeId = new Map<string, string>();
  for (const emp of guards) {
    for (const epf of guardEpfKeys(emp)) {
      epfToEmployeeId.set(epf, emp.id);
    }
  }

  const pairs = await listApprovedAttendanceShiftPairs(
    supabase,
    employeeIds,
    employeeIdSet,
    epfToEmployeeId,
    start,
    end,
    companyId,
  );

  const counts = new Map<string, number>();
  for (const pair of pairs) {
    if (!pair.siteProfileId) continue;
    const key = `${pair.employeeId}:${pair.siteProfileId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export type FmGuardShiftRecord = {
  employeeId: string;
  siteProfileId: string | null;
  shiftDate: string;
};

function incrementFmShiftCount(counts: Map<string, number>, employeeId: string, siteId: string) {
  const key = `${employeeId}:${siteId}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** FM portfolio: union of verified time shifts, approved attendance pairs, and SM CONFIRMED slots. */
export async function fetchGuardShiftRecordsForFm(
  supabase: SupabaseClient,
  guards: GuardEmpRow[],
  payrollMonthIso: string,
  companyId: string,
  preloadedModeASites?: { id: string; site_name: string }[],
): Promise<{ counts: Map<string, number>; records: FmGuardShiftRecord[] }> {
  const { start, end } = payrollMonthDateRange(payrollMonthIso);
  const employeeIds = guards.map((g) => g.id);
  const employeeIdSet = new Set(employeeIds);
  const epfToEmployeeId = new Map<string, string>();
  for (const emp of guards) {
    for (const epf of guardEpfKeys(emp)) {
      epfToEmployeeId.set(epf, emp.id);
    }
  }

  const counts = new Map<string, number>();
  const records: FmGuardShiftRecord[] = [];

  if (employeeIds.length > 0) {
    const { data: timeRows, error: timeError } = await supabase
      .from('time_shifts')
      .select('employee_id, location_id, shift_date')
      .eq('company_id', companyId)
      .eq('verification_status', 'VERIFIED')
      .gte('shift_date', start)
      .lte('shift_date', end)
      .in('employee_id', employeeIds);

    if (timeError) {
      console.error('❌ FM (time_shifts):', timeError.message);
    } else {
      for (const row of timeRows ?? []) {
        const employeeId = String(row.employee_id ?? '');
        const siteProfileId = row.location_id ? String(row.location_id) : null;
        const shiftDate = String(row.shift_date ?? '').slice(0, 10);
        if (!employeeIdSet.has(employeeId) || !siteProfileId || !shiftDate) continue;
        records.push({ employeeId, siteProfileId, shiftDate });
        incrementFmShiftCount(counts, employeeId, siteProfileId);
      }
    }
  }

  const attendancePairs = await listApprovedAttendanceShiftPairs(
    supabase,
    employeeIds,
    employeeIdSet,
    epfToEmployeeId,
    start,
    end,
    companyId,
  );
  for (const pair of attendancePairs) {
    if (!pair.siteProfileId) continue;
    records.push({
      employeeId: pair.employeeId,
      siteProfileId: pair.siteProfileId,
      shiftDate: pair.shiftDate,
    });
    incrementFmShiftCount(counts, pair.employeeId, pair.siteProfileId);
  }

  const epfList = [...epfToEmployeeId.keys()];
  if (epfList.length > 0) {
    const modeASites =
      preloadedModeASites ??
      (await (async () => {
        const { data: modeASitesRows, error: siteError } = await supabase
          .from('site_profiles')
          .select('id, site_name')
          .eq('company_id', companyId)
          .eq('verification_mode', 'A');
        if (siteError) {
          console.error('❌ FM (site_profiles mode A):', siteError.message);
          return [];
        }
        return (modeASitesRows ?? []).map((site) => ({
          id: String(site.id),
          site_name: String(site.site_name ?? ''),
        }));
      })());

    if (modeASites.length > 0) {
      const siteIdByKey = new Map<string, string>();
      const modeASiteKeys = new Set<string>();
      for (const site of modeASites) {
        const name = site.site_name.trim();
        if (!name) continue;
        const key = siteKeyFromName(name);
        modeASiteKeys.add(key);
        siteIdByKey.set(key, site.id);
      }

      const { data: smRows, error: smError } = await supabase
        .from('sm_guard_attendance')
        .select('guard_epf, site_name, shift_date, shift_type')
        .gte('shift_date', start)
        .lte('shift_date', end)
        .eq('status', 'CONFIRMED')
        .in('guard_epf', epfList);

      if (smError) {
        console.error('❌ FM (sm_guard_attendance):', smError.message);
      } else {
        for (const row of smRows ?? []) {
          const siteName = String(row.site_name ?? '').trim();
          if (!siteName) continue;
          const siteKey = siteKeyFromName(siteName);
          if (!modeASiteKeys.has(siteKey)) continue;
          const siteProfileId = siteIdByKey.get(siteKey);
          if (!siteProfileId) continue;
          const employeeId = epfToEmployeeId.get(String(row.guard_epf ?? '').trim());
          const shiftDate = String(row.shift_date ?? '').slice(0, 10);
          if (!employeeId || !shiftDate) continue;
          records.push({ employeeId, siteProfileId, shiftDate });
          incrementFmShiftCount(counts, employeeId, siteProfileId);
        }
      }
    }
  }

  return { counts, records };
}

/** FM portfolio: SM CONFIRMED slots on Mode A sites → `employeeId:siteProfileId` counts. */
export async function fetchSmConfirmedShiftCountsForFm(
  supabase: SupabaseClient,
  guards: GuardEmpRow[],
  payrollMonthIso: string,
  companyId: string,
): Promise<Map<string, number>> {
  const { start, end } = payrollMonthDateRange(payrollMonthIso);
  const epfToEmployeeId = new Map<string, string>();
  for (const emp of guards) {
    for (const epf of guardEpfKeys(emp)) {
      epfToEmployeeId.set(epf, emp.id);
    }
  }
  const epfList = [...epfToEmployeeId.keys()];
  if (!epfList.length) return new Map();

  const { data: modeASites, error: siteError } = await supabase
    .from('site_profiles')
    .select('id, site_name')
    .eq('company_id', companyId)
    .eq('verification_mode', 'A');
  if (siteError || !modeASites?.length) return new Map();

  const siteIdByKey = new Map<string, string>();
  const modeASiteKeys = new Set<string>();
  for (const site of modeASites) {
    const name = String(site.site_name ?? '').trim();
    if (!name) continue;
    const key = siteKeyFromName(name);
    modeASiteKeys.add(key);
    siteIdByKey.set(key, String(site.id));
  }

  const { data: smRows, error: smError } = await supabase
    .from('sm_guard_attendance')
    .select('guard_epf, site_name, shift_date, shift_type')
    .gte('shift_date', start)
    .lte('shift_date', end)
    .eq('status', 'CONFIRMED')
    .in('guard_epf', epfList);

  if (smError) {
    console.error('❌ FM (sm_guard_attendance):', smError.message);
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const row of smRows ?? []) {
    const siteName = String(row.site_name ?? '').trim();
    if (!siteName) continue;
    const siteKey = siteKeyFromName(siteName);
    if (!modeASiteKeys.has(siteKey)) continue;
    const siteId = siteIdByKey.get(siteKey);
    if (!siteId) continue;
    const employeeId = epfToEmployeeId.get(String(row.guard_epf ?? '').trim());
    if (!employeeId) continue;
    const key = `${employeeId}:${siteId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function fetchMonthlySiteShiftRollup(
  supabase: SupabaseClient,
  guards: GuardEmpRow[],
  payrollMonthIso: string,
  companyId: string | null,
): Promise<MonthlySiteShiftRollup> {
  const { start, end } = payrollMonthDateRange(payrollMonthIso);
  const epfToEmployeeId = new Map<string, string>();
  const employeeIds = guards.map((g) => g.id);
  const employeeIdSet = new Set(employeeIds);

  for (const emp of guards) {
    for (const epf of guardEpfKeys(emp)) {
      epfToEmployeeId.set(epf, emp.id);
    }
  }

  const acc: ShiftAccumulator = new Map();
  const siteNameByKey = new Map<string, string>();
  const [siteModeByKey, shiftTiming] = await Promise.all([
    loadSiteVerificationModeByKey(supabase, companyId),
    loadShiftTimingSettings(supabase, companyId),
  ]);

  const epfList = [...epfToEmployeeId.keys()];
  if (epfList.length > 0) {
    // Billing / deductions: CONFIRMED only (excludes SUBMITTED + CANCELLED — §1.4.6–1.4.7).
    const { data: smRows, error: smError } = await supabase
      .from('sm_guard_attendance')
      .select('guard_epf, site_name, shift_date, shift_type')
      .gte('shift_date', start)
      .lte('shift_date', end)
      .eq('status', 'CONFIRMED')
      .in('guard_epf', epfList);

    if (smError) {
      console.error('❌ Deductions (sm_guard_attendance):', smError.message);
    } else {
      for (const row of smRows ?? []) {
        const employeeId = epfToEmployeeId.get(String(row.guard_epf ?? '').trim());
        if (!employeeId || !row.shift_date || !row.site_name) continue;
        const slotKey = canonicalShiftSlotKey(row.shift_date, row.shift_type);
        recordShiftSlot(acc, String(row.site_name), employeeId, slotKey, siteNameByKey);
      }
    }
  }

  if (employeeIds.length > 0) {
    let rosterQuery = supabase
      .from('time_rosters')
      .select('employee_id, shift_date, planned_start_time, site_profiles ( site_name )')
      .gte('shift_date', start)
      .lte('shift_date', end)
      .eq('status', 'ACTIVE')
      .in('employee_id', employeeIds);

    if (companyId) rosterQuery = rosterQuery.eq('company_id', companyId);

    const { data: rosterRows, error: rosterError } = await rosterQuery;
    if (rosterError) {
      console.error('❌ Deductions (time_rosters):', rosterError.message);
    } else {
      for (const row of rosterRows ?? []) {
        const employeeId = String(row.employee_id ?? '');
        if (!employeeIdSet.has(employeeId) || !row.shift_date) continue;
        const siteName = parseSiteNameFromRelation(
          row.site_profiles as { site_name?: string } | { site_name?: string }[] | null,
        );
        if (!siteName || !siteAllowsCheckInPayrollSources(siteName, siteModeByKey)) continue;
        const shiftType = inferShiftTypeFromCheckIn(
          String(row.planned_start_time ?? `${row.shift_date}T07:00:00Z`),
          shiftTiming,
        );
        recordShiftSlot(
          acc,
          siteName,
          employeeId,
          canonicalShiftSlotKey(String(row.shift_date), shiftType),
          siteNameByKey,
        );
      }
    }

    let shiftQuery = supabase
      .from('time_shifts')
      .select('employee_id, shift_date, check_in_time, site_profiles ( site_name )')
      .eq('verification_status', 'VERIFIED')
      .gte('shift_date', start)
      .lte('shift_date', end)
      .in('employee_id', employeeIds);

    if (companyId) shiftQuery = shiftQuery.eq('company_id', companyId);

    const { data: shiftRows, error: shiftError } = await shiftQuery;
    if (shiftError) {
      console.error('❌ Deductions (time_shifts):', shiftError.message);
    } else {
      for (const row of shiftRows ?? []) {
        const employeeId = String(row.employee_id ?? '');
        if (!employeeIdSet.has(employeeId) || !row.shift_date) continue;
        const siteName = parseSiteNameFromRelation(
          row.site_profiles as { site_name?: string } | { site_name?: string }[] | null,
        );
        if (!siteName || !siteAllowsCheckInPayrollSources(siteName, siteModeByKey)) continue;
        const shiftType = inferShiftTypeFromCheckIn(
          String(row.check_in_time ?? `${row.shift_date}T07:00:00Z`),
          shiftTiming,
        );
        recordShiftSlot(
          acc,
          siteName,
          employeeId,
          canonicalShiftSlotKey(String(row.shift_date), shiftType),
          siteNameByKey,
        );
      }
    }

    const attendancePairs = await listApprovedAttendanceShiftPairs(
      supabase,
      employeeIds,
      employeeIdSet,
      epfToEmployeeId,
      start,
      end,
      companyId,
    );
    for (const pair of attendancePairs) {
      const shiftType = inferShiftTypeFromCheckIn(pair.checkInDeviceTime, shiftTiming);
      recordShiftSlot(
        acc,
        pair.siteName,
        pair.employeeId,
        canonicalShiftSlotKey(pair.shiftDate, shiftType),
        siteNameByKey,
      );
    }
  }

  return {
    shiftCountBySite: rollupFromAccumulator(acc),
    siteNameByKey,
  };
}

export function hasShiftRollupData(rollup: MonthlySiteShiftRollup): boolean {
  for (const counts of rollup.shiftCountBySite.values()) {
    if (counts.size > 0) return true;
  }
  return false;
}
