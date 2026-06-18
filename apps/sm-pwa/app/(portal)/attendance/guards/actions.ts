'use server'

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../../../../../../packages/supabase/server';
import { resolveSmSessionEpf } from '../../../../lib/sm-assignments';
import {
  colomboTodayIso,
  isShiftDateSubmittable,
  type ShiftType,
} from '../../../../lib/shift-timing';

export type ExistingAttendanceEntry = {
  site_name: string;
  guard_epf: string;
  status: string;
};

async function resolveEpf(): Promise<string> {
  return resolveSmSessionEpf();
}

async function fetchShiftTimingSettings() {
  const supabase = createSupabaseServiceClient();
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

export async function getAttendanceForDate(
  shiftDate: string,
  shiftType: ShiftType,
): Promise<ExistingAttendanceEntry[]> {
  const epf = await resolveEpf();
  const supabase = createSupabaseServiceClient();

  const { data } = await supabase
    .from('sm_guard_attendance')
    .select('site_name, guard_epf, status')
    .eq('sm_epf', epf)
    .eq('shift_date', shiftDate)
    .eq('shift_type', shiftType);

  return data ?? [];
}

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function lockedKey(siteName: string, guardEpf: string): string {
  return `${normalizeSiteKey(siteName)}::${guardEpf.trim().toUpperCase()}`;
}

export async function submitGuardAttendanceAction(
  entries: { siteName: string; guardEpf: string }[],
  shiftDate: string,
  shiftType: ShiftType,
): Promise<{ success?: boolean; error?: string }> {
  const epf = await resolveEpf();
  const supabase = createSupabaseServiceClient();
  const startTimes = await fetchShiftTimingSettings();
  const now = new Date();

  if (!isShiftDateSubmittable(shiftDate, shiftType, startTimes, now)) {
    return { error: 'Cannot submit for past dates.' };
  }

  const guardEpfs = entries.map((e) => e.guardEpf);
  if (new Set(guardEpfs).size !== guardEpfs.length) {
    return { error: 'A guard cannot be assigned to multiple sites.' };
  }

  if (guardEpfs.length > 0) {
    const { data: crossSiteRows, error: crossSiteError } = await supabase
      .from('sm_guard_attendance')
      .select('guard_epf, site_name, sm_epf')
      .eq('shift_date', shiftDate)
      .eq('shift_type', shiftType)
      .neq('status', 'CANCELLED')
      .in('guard_epf', guardEpfs);

    if (crossSiteError) {
      console.error('[Guard Attendance] Cross-site lookup error:', crossSiteError.message);
      return { error: 'Failed to save. Please try again.' };
    }

    for (const entry of entries) {
      const conflict = (crossSiteRows ?? []).find(
        (row) =>
          row.guard_epf === entry.guardEpf &&
          normalizeSiteKey(row.site_name) !== normalizeSiteKey(entry.siteName),
      );
      if (conflict) {
        return {
          error: `${entry.guardEpf} is already rostered at ${conflict.site_name} for this shift.`,
        };
      }
    }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('sm_guard_attendance')
    .select('site_name, guard_epf, status')
    .eq('sm_epf', epf)
    .eq('shift_date', shiftDate)
    .eq('shift_type', shiftType);

  if (existingError) {
    console.error('[Guard Attendance] Existing lookup error:', existingError.message);
    return { error: 'Failed to save. Please try again.' };
  }

  const locked = new Map<string, { site_name: string; guard_epf: string }>();
  for (const row of existingRows ?? []) {
    if (!row.guard_epf) continue;
    locked.set(lockedKey(row.site_name, row.guard_epf), {
      site_name: row.site_name,
      guard_epf: row.guard_epf,
    });
  }

  for (const entry of entries) {
    for (const lockedRow of locked.values()) {
      if (
        lockedRow.guard_epf === entry.guardEpf &&
        normalizeSiteKey(lockedRow.site_name) !== normalizeSiteKey(entry.siteName)
      ) {
        return { error: 'A previously submitted guard assignment cannot be moved.' };
      }
    }
  }

  for (const lockedRow of locked.values()) {
    const stillPresent = entries.some(
      (entry) =>
        normalizeSiteKey(entry.siteName) === normalizeSiteKey(lockedRow.site_name) &&
        entry.guardEpf === lockedRow.guard_epf,
    );
    if (!stillPresent) {
      return {
        error: `Cannot change or remove ${lockedRow.guard_epf} — previous submission is locked.`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from('sm_guard_attendance')
    .delete()
    .eq('sm_epf', epf)
    .eq('shift_date', shiftDate)
    .eq('shift_type', shiftType);

  if (deleteError) {
    console.error('[Guard Attendance] Delete error:', deleteError.message);
    return { error: 'Failed to save. Please try again.' };
  }

  if (entries.length === 0) return { success: true };

  const { error: insertError } = await supabase
    .from('sm_guard_attendance')
    .insert(
      entries.map((e) => ({
        sm_epf: epf,
        shift_date: shiftDate,
        shift_type: shiftType,
        site_name: e.siteName,
        guard_epf: e.guardEpf,
        status: 'SUBMITTED',
      })),
    );

  if (insertError) {
    console.error('[Guard Attendance] Insert error:', insertError.message);
    return { error: 'Failed to save. Please try again.' };
  }

  return { success: true };
}

export async function getGuardAttendanceShiftSettings() {
  const startTimes = await fetchShiftTimingSettings();
  return {
    startTimes,
    defaultDate: colomboTodayIso(),
  };
}
