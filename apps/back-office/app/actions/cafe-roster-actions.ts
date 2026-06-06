'use server';

import { createSupabaseServerClient } from '../../../../packages/supabase/server';

type CafeStaffRow = {
  guard_id: string;
  employees: {
    id: string;
    first_name: string;
    last_name: string;
  }[];
};

export async function getCafeStaff(cafeId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('guard_sector_assignments')
    .select('guard_id, employees(id, first_name, last_name)')
    .eq('sector_id', cafeId);

  if (error) throw new Error(error.message);

  return (data as unknown as CafeStaffRow[]).flatMap((d) => d.employees);
}

export async function getWeeklyRoster(
  cafeId: string,
  weekStartDate: string,
  weekEndDate: string
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('rostered_shifts')
    .select('id, guard_id, shift_date, shift_type')
    .eq('sector_id', cafeId)
    .gte('shift_date', weekStartDate)
    .lte('shift_date', weekEndDate);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function applyMasterLayoutAction(
  cafeId: string,
  companyId: string,
  weekDates: string[]
) {
  const supabase = await createSupabaseServerClient();

  // Retrieve the master template for this specific cafe
  const { data: template, error: templateError } = await supabase
    .from('cafe_master_layouts')
    .select('day_of_week, shift_type, guard_id')
    .eq('sector_id', cafeId);

  if (templateError || !template?.length) {
    throw new Error('Master layout not found');
  }

  // Map template to actual dates
  const newShifts = weekDates.flatMap((date, index) => {
    // Assuming weekDates maps Mon-Sun (1-7 in DB logic)
    const dayTemplate = template.filter((t) => t.day_of_week === index + 1);
    return dayTemplate.map((t) => ({
      company_id: companyId,
      sector_id: cafeId,
      guard_id: t.guard_id,
      shift_date: date,
      shift_type: t.shift_type,
    }));
  });

  const { error: insertError } = await supabase
    .from('rostered_shifts')
    .insert(newShifts);

  if (insertError) throw new Error(insertError.message);
  return { success: true as const };
}

export async function updateShiftException(
  shiftId: string,
  newDate: string,
  newShiftType: string
) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('rostered_shifts')
    .update({ shift_date: newDate, shift_type: newShiftType })
    .eq('id', shiftId);

  if (error) throw new Error(error.message);
  return { success: true as const };
}
