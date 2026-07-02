import type { SupabaseClient } from '@supabase/supabase-js';

import type { CafeShiftType } from '../app/hr/cafe-roster/utils';

const CAFE_ROSTER_SHIFT_TYPES = ['MORNING', 'EVENING', 'DAY'] as const;

/** MD Settings internal work location ids (not site_profiles UUIDs). */
export function isMdInternalBranchId(branchId: string): boolean {
  return branchId.trim().startsWith('loc_');
}

export async function fetchCafeRosterShifts(
  db: SupabaseClient,
  input: {
    branchId: string;
    employeeIds: string[];
    windowStart: string;
    windowEnd: string;
    companyId: string | null;
  },
): Promise<Array<{ guard_id: string; shift_date: string; shift_type: string }>> {
  const { branchId, employeeIds, windowStart, windowEnd, companyId } = input;
  if (!employeeIds.length) return [];

  if (isMdInternalBranchId(branchId)) {
    let query = db
      .from('cafe_rostered_shifts')
      .select('employee_id, shift_date, shift_type')
      .eq('branch_id', branchId)
      .in('employee_id', employeeIds)
      .gte('shift_date', windowStart)
      .lte('shift_date', windowEnd);
    if (companyId) query = query.eq('company_id', companyId);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      guard_id: String(row.employee_id),
      shift_date: String(row.shift_date),
      shift_type: String(row.shift_type),
    }));
  }

  let query = db
    .from('rostered_shifts')
    .select('guard_id, shift_date, shift_type')
    .eq('sector_id', branchId)
    .in('guard_id', employeeIds)
    .gte('shift_date', windowStart)
    .lte('shift_date', windowEnd);
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    guard_id: String(row.guard_id),
    shift_date: String(row.shift_date),
    shift_type: String(row.shift_type),
  }));
}

export async function clearCafeRosterShiftForDay(
  db: SupabaseClient,
  input: {
    branchId: string;
    companyId: string;
    employeeId: string;
    shiftDate: string;
  },
): Promise<void> {
  const { branchId, companyId, employeeId, shiftDate } = input;

  if (isMdInternalBranchId(branchId)) {
    const { error } = await db
      .from('cafe_rostered_shifts')
      .delete()
      .eq('company_id', companyId)
      .eq('branch_id', branchId)
      .eq('employee_id', employeeId)
      .eq('shift_date', shiftDate);
    if (error) throw error;
    return;
  }

  const { error } = await db
    .from('rostered_shifts')
    .delete()
    .eq('company_id', companyId)
    .eq('sector_id', branchId)
    .eq('guard_id', employeeId)
    .eq('shift_date', shiftDate)
    .in('shift_type', [...CAFE_ROSTER_SHIFT_TYPES]);
  if (error) throw error;
}

export async function upsertCafeRosterShift(
  db: SupabaseClient,
  input: {
    branchId: string;
    companyId: string;
    employeeId: string;
    shiftDate: string;
    shiftType: CafeShiftType;
  },
): Promise<void> {
  await clearCafeRosterShiftForDay(db, input);

  if (isMdInternalBranchId(input.branchId)) {
    const { error } = await db.from('cafe_rostered_shifts').insert({
      company_id: input.companyId,
      branch_id: input.branchId,
      employee_id: input.employeeId,
      shift_date: input.shiftDate,
      shift_type: input.shiftType,
    });
    if (error) throw error;
    return;
  }

  const { error } = await db.from('rostered_shifts').insert({
    company_id: input.companyId,
    sector_id: input.branchId,
    guard_id: input.employeeId,
    shift_date: input.shiftDate,
    shift_type: input.shiftType,
  });
  if (error) throw error;
}
