'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';

export type SectorGuard = {
  id: string;
  first_name: string;
  last_name: string;
  rank_enum: string;
};

export type OverlappingShift = {
  guard_id: string;
  shift_start: string;
  shift_end: string;
};

export type RosterLine = {
  guard_id: string;
  shift_type: string;
};

function dayBounds(shiftDate: string, shiftType: string) {
  const base = shiftDate;
  if (shiftType.toLowerCase() === 'night') {
    return {
      planned_start_time: `${base}T20:00:00.000Z`,
      planned_end_time: `${base}T06:00:00.000Z`,
    };
  }
  return {
    planned_start_time: `${base}T08:00:00.000Z`,
    planned_end_time: `${base}T16:00:00.000Z`,
  };
}

function previousDate(shiftDate: string) {
  const d = new Date(`${shiftDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

function mapEmployeeRow(row: Record<string, unknown>): SectorGuard {
  const fullName = String(row.full_name ?? 'UNKNOWN GUARD');
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? fullName;
  const last = parts.slice(1).join(' ') || '—';
  return {
    id: String(row.id),
    first_name: first,
    last_name: last,
    rank_enum: String(row.rank ?? row.rank_enum ?? 'JSO').toUpperCase(),
  };
}

export async function getSectorGuards(sectorId: string, shiftDate: string) {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, full_name, rank, rank_enum, status')
      .eq('status', 'ACTIVE');

    if (empError) throw empError;

    const guards = (employees ?? []).map((row) =>
      mapEmployeeRow(row as Record<string, unknown>)
    );

    const { data: conflicts, error: conflictError } = await supabase
      .from('time_rosters')
      .select('employee_id, planned_start_time, planned_end_time')
      .eq('shift_date', shiftDate)
      .eq('status', 'ACTIVE')
      .neq('site_id', sectorId);

    if (conflictError) throw conflictError;

    const overlappingShifts: OverlappingShift[] = (conflicts ?? []).map((row) => ({
      guard_id: String(row.employee_id),
      shift_start: String(row.planned_start_time),
      shift_end: String(row.planned_end_time),
    }));

    return { guards, overlappingShifts };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ getSectorGuards:', message);
    return { guards: [], overlappingShifts: [] };
  }
}

export async function getYesterdayRoster(sectorId: string, shiftDate: string) {
  try {
    const supabase = await createSupabaseServerClient();
    const yesterday = previousDate(shiftDate);

    const { data, error } = await supabase
      .from('time_rosters')
      .select('employee_id, shift_date, planned_start_time')
      .eq('site_id', sectorId)
      .eq('shift_date', yesterday)
      .eq('status', 'ACTIVE');

    if (error) throw error;
    if (!data?.length) return null;

    return data.map((row) => {
      const startHour = new Date(String(row.planned_start_time)).getUTCHours();
      const shift_type = startHour >= 18 ? 'Night' : 'Day';
      return {
        guard_id: String(row.employee_id),
        shift_type,
      };
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ getYesterdayRoster:', message);
    return null;
  }
}

export async function submitRoster(
  payload: {
    guard_id: string;
    shift_type: string;
    sector_id: string;
    shift_date: string;
    company_id: string;
  }[]
) {
  try {
    if (!payload.length) return { success: false, error: 'No roster lines to sync' };

    const supabase = await createSupabaseServerClient();

    const rows = payload.map((line) => {
      const { planned_start_time, planned_end_time } = dayBounds(
        line.shift_date,
        line.shift_type
      );
      return {
        company_id: line.company_id,
        employee_id: line.guard_id,
        site_id: line.sector_id,
        shift_date: line.shift_date,
        planned_start_time,
        planned_end_time,
        status: 'ACTIVE' as const,
      };
    });

    const { error } = await supabase.from('time_rosters').insert(rows);
    if (error) throw error;

    revalidatePath('/');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ submitRoster:', message);
    return { success: false, error: message };
  }
}
