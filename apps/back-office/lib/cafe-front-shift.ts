import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import type { CafeEmployeeRow } from './cafe-front-auth';
import { resolveCompanyIdForSession } from './company-context';

export type CafeShiftGate = {
  rosteredToday: boolean;
  checkedInToday: boolean;
  canAcceptOrders: boolean;
  shiftType: string | null;
  checkinAt: string | null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getCafeShiftGate(
  employee: CafeEmployeeRow,
): Promise<CafeShiftGate> {
  const server = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(server);
  const supabase = createSupabaseServiceClient();
  const today = todayIso();

  const { data: rosterRows } = await supabase
    .from('rostered_shifts')
    .select('shift_type')
    .eq('company_id', companyId)
    .eq('guard_id', employee.id)
    .eq('shift_date', today)
    .limit(1);

  const rosteredToday = (rosterRows?.length ?? 0) > 0;
  const shiftType = rosterRows?.[0]?.shift_type ?? null;

  const { data: checkin } = await supabase
    .from('cafe_staff_checkins')
    .select('checked_in_at, shift_type')
    .eq('company_id', companyId)
    .eq('employee_id', employee.id)
    .eq('checkin_date', today)
    .maybeSingle();

  const checkedInToday = Boolean(checkin?.checked_in_at);

  return {
    rosteredToday,
    checkedInToday,
    canAcceptOrders: rosteredToday && checkedInToday,
    shiftType: checkin?.shift_type ?? shiftType,
    checkinAt: checkin?.checked_in_at ?? null,
  };
}
