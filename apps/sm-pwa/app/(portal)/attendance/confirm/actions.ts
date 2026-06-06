'use server'

import { cookies } from 'next/headers';
import { createSupabaseServiceClient } from '../../../../../../packages/supabase/server';
import { redirect } from 'next/navigation';

// ── Shift time helpers ────────────────────────────────────────────────────────

async function fetchShiftStartTimes(): Promise<{ DAY: string; NIGHT: string }> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('md_settings')
    .select('security_day_start, security_night_start')
    .limit(1)
    .maybeSingle();

  return {
    DAY:   (data as { security_day_start?: string | null } | null)?.security_day_start   ?? '07:00',
    NIGHT: (data as { security_night_start?: string | null } | null)?.security_night_start ?? '19:00',
  };
}

function colomboToUTC(timeStr: string): { hour: number; minute: number } | null {
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const localHour   = parseInt(parts[0], 10);
  const localMinute = parseInt(parts[1], 10);
  if (isNaN(localHour) || isNaN(localMinute)) return null;

  let utcMinute = localMinute - 30;
  let utcHour   = localHour - 5;
  if (utcMinute < 0) { utcMinute += 60; utcHour -= 1; }
  if (utcHour   < 0) { utcHour += 24; }
  return { hour: utcHour, minute: utcMinute };
}

function getShiftStartUTC(
  shiftDate: string,
  shiftType: string,
  startTimes: { DAY: string; NIGHT: string },
): Date | null {
  const timeStr = startTimes[shiftType as 'DAY' | 'NIGHT'];
  if (!timeStr) return null;
  const utc = colomboToUTC(timeStr);
  if (!utc) return null;
  const dt = new Date(`${shiftDate}T00:00:00Z`);
  dt.setUTCHours(utc.hour, utc.minute, 0, 0);
  return dt;
}

// ── Auth helper ───────────────────────────────────────────────────────────────

export async function resolveEpf(): Promise<string> {
  const cookieStore = await cookies();
  const demo = cookieStore.get('sm_demo_session')?.value;
  if (demo) return demo.toUpperCase();

  const supabase = createSupabaseServiceClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');
  return session.user.email?.split('@')[0].toUpperCase() ?? '';
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShiftToConfirm {
  shift_date: string;
  shift_type: 'DAY' | 'NIGHT';
  status: 'SUBMITTED' | 'CONFIRMED';
  guard_count: number;
  confirmed_count: number;
  sites: { site_name: string; guards: string[] }[];
  can_confirm_now: boolean;
  minutes_until_window: number | null;
  is_late: boolean;
  minutes_late: number | null;
}

// ── confirmShiftAction — saves editable entries + marks CONFIRMED ─────────────

export async function confirmShiftAction(
  entries: { siteName: string; guardEpf: string }[],
  shiftDate: string,
  shiftType: 'DAY' | 'NIGHT',
): Promise<{ success?: boolean; error?: string }> {
  const epf     = await resolveEpf();
  const supabase = createSupabaseServiceClient();

  // Timing window check
  const startTimes = await fetchShiftStartTimes();
  const shiftStart = getShiftStartUTC(shiftDate, shiftType, startTimes);
  if (shiftStart) {
    const now            = new Date();
    const twoHoursBefore = new Date(shiftStart.getTime() - 2 * 60 * 60 * 1000);
    const twoHoursAfter  = new Date(shiftStart.getTime() + 2 * 60 * 60 * 1000);
    if (now < twoHoursBefore) return { error: 'Confirmation opens 2 hours before your shift starts.' };
    if (now > twoHoursAfter)  return { error: 'Confirmation window has closed (more than 2 hours after shift start).' };
  }

  // Duplicate guard check
  const epfs = entries.map(e => e.guardEpf);
  if (new Set(epfs).size !== epfs.length) {
    return { error: 'A guard cannot be assigned to multiple sites.' };
  }

  // Replace all rows for this shift with the confirmed assignments
  const { error: delErr } = await supabase
    .from('sm_guard_attendance')
    .delete()
    .eq('sm_epf', epf)
    .eq('shift_date', shiftDate)
    .eq('shift_type', shiftType);

  if (delErr) {
    console.error('[SM Confirm] Delete error:', delErr.message);
    return { error: 'Failed to update shift. Please try again.' };
  }

  if (entries.length > 0) {
    const { error: insErr } = await supabase
      .from('sm_guard_attendance')
      .insert(entries.map(e => ({
        sm_epf:      epf,
        shift_date:  shiftDate,
        shift_type:  shiftType,
        site_name:   e.siteName,
        guard_epf:   e.guardEpf,
        status:      'CONFIRMED',
      })));

    if (insErr) {
      console.error('[SM Confirm] Insert error:', insErr.message);
      return { error: 'Failed to save guard assignments.' };
    }
  }

  return { success: true };
}

// ── getShiftsToConfirm — returns the single next upcoming SUBMITTED shift ─────

export async function getShiftsToConfirm(epf: string): Promise<ShiftToConfirm[]> {
  const supabase = createSupabaseServiceClient();
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const now      = new Date();

  const [rowsResult, startTimes] = await Promise.all([
    supabase
      .from('sm_guard_attendance')
      .select('shift_date, shift_type, site_name, guard_epf, status')
      .eq('sm_epf', epf)
      .in('shift_date', [today, tomorrow])
      .neq('status', 'CANCELLED')
      .order('shift_date', { ascending: true })
      .order('shift_type', { ascending: true }),
    fetchShiftStartTimes(),
  ]);

  const rows = rowsResult.data ?? [];
  if (rows.length === 0) return [];

  const shiftMap = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.shift_date}::${row.shift_type}`;
    if (!shiftMap.has(key)) shiftMap.set(key, []);
    shiftMap.get(key)!.push(row);
  }

  type ShiftCandidate = ShiftToConfirm & { _startUtc: Date | null };
  const candidates: ShiftCandidate[] = [];

  for (const [, shiftRows] of shiftMap) {
    const { shift_date, shift_type } = shiftRows[0];

    const confirmedCount = shiftRows.filter(r => r.status === 'CONFIRMED').length;
    const totalCount     = shiftRows.length;
    const status         = confirmedCount === totalCount ? 'CONFIRMED' : 'SUBMITTED';

    if (status !== 'SUBMITTED') continue;

    const siteMap = new Map<string, string[]>();
    for (const r of shiftRows) {
      if (!siteMap.has(r.site_name)) siteMap.set(r.site_name, []);
      siteMap.get(r.site_name)!.push(r.guard_epf);
    }
    const sites = Array.from(siteMap.entries()).map(([site_name, guards]) => ({ site_name, guards }));

    const shiftStart            = getShiftStartUTC(shift_date, shift_type, startTimes);
    let canConfirmNow           = true;
    let minutesUntilWindow: number | null = null;
    let isLate                  = false;
    let minutesLate: number | null = null;
    let windowExpired           = false;

    if (shiftStart) {
      const twoHoursBefore = new Date(shiftStart.getTime() - 2 * 60 * 60 * 1000);
      const twoHoursAfter  = new Date(shiftStart.getTime() + 2 * 60 * 60 * 1000);

      canConfirmNow = now >= twoHoursBefore && now <= twoHoursAfter;
      windowExpired = now > twoHoursAfter;

      if (now < twoHoursBefore) {
        minutesUntilWindow = Math.ceil((twoHoursBefore.getTime() - now.getTime()) / 60000);
      }
      if (now >= shiftStart) {
        isLate      = true;
        minutesLate = Math.floor((now.getTime() - shiftStart.getTime()) / 60000);
      }
    }

    if (windowExpired) continue;

    candidates.push({
      shift_date,
      shift_type: shift_type as 'DAY' | 'NIGHT',
      status,
      guard_count:          totalCount,
      confirmed_count:      confirmedCount,
      sites,
      can_confirm_now:      canConfirmNow,
      minutes_until_window: minutesUntilWindow,
      is_late:              isLate,
      minutes_late:         minutesLate,
      _startUtc:            shiftStart,
    });
  }

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => (a._startUtc?.getTime() ?? 0) - (b._startUtc?.getTime() ?? 0));
  const { _startUtc, ...next } = candidates[0];
  return [next];
}
