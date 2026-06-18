import type { SupabaseClient } from '@supabase/supabase-js';

import {
  fetchWithRosterCompanyFallback,
  rosterCompanyId,
} from './company-context';

const COLOMBO_TZ = 'Asia/Colombo';

export type AttendanceLogRow = {
  id: string;
  emp_number: string;
  action_type: string;
  device_time: string;
  latitude: number | null;
  longitude: number | null;
  sync_type: string | null;
  photo_url: string | null;
  status: string | null;
  company_id: string | null;
};

export function colomboTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COLOMBO_TZ }).format(now);
}

export function shiftDateFromDeviceTime(deviceTime: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COLOMBO_TZ }).format(
    new Date(deviceTime),
  );
}

function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function colomboDayRange(dateIso: string): { start: string; end: string } {
  const next = addCalendarDays(dateIso, 1);
  return {
    start: `${dateIso}T00:00:00+05:30`,
    end: `${next}T00:00:00+05:30`,
  };
}

async function queryLogsForCompany(
  supabase: SupabaseClient,
  companyId: string | null,
  date?: string,
): Promise<AttendanceLogRow[]> {
  let query = supabase
    .from('attendance_logs')
    .select(
      'id, emp_number, action_type, device_time, latitude, longitude, sync_type, photo_url, status, company_id',
    )
    .or('status.in.(PENDING,FLAGGED,APPROVED,REJECTED),status.is.null')
    .order('device_time', { ascending: false })
    .limit(500);

  if (companyId) {
    query = query.or(`company_id.eq.${companyId},company_id.is.null`);
  }

  if (date) {
    const { start, end } = colomboDayRange(date);
    query = query.gte('device_time', start).lt('device_time', end);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AttendanceLogRow[];
}

/** Load attendance logs for TM/OM verification (service role + tenant fallback). */
export async function fetchAttendanceLogsForVerification(
  supabase: SupabaseClient,
  sessionCompanyId: string | null,
  date?: string,
): Promise<AttendanceLogRow[]> {
  const preferred = rosterCompanyId(sessionCompanyId);

  try {
    return await fetchWithRosterCompanyFallback(
      (companyId) => queryLogsForCompany(supabase, companyId, date),
      sessionCompanyId,
    );
  } catch (error) {
    console.error('fetchAttendanceLogsForVerification:', error);
    if (preferred) {
      try {
        return await queryLogsForCompany(supabase, preferred, date);
      } catch {
        return [];
      }
    }
    return [];
  }
}
