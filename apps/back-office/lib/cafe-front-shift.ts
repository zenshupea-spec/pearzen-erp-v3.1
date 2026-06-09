import { createSupabaseServerClient } from '../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import type { CafeEmployeeRow } from './cafe-front-auth';
import {
  formatPortalGraceEndTime,
  isWithinPortalAccessWindow,
  loadCafeOpenHours,
} from './cafe-front-checkin';
import { resolveCompanyIdForSession } from './company-context';
function normalizeCafeShiftType(value: string | null | undefined): 'MORNING' | 'EVENING' | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'MORNING' || raw === 'DAY') return 'MORNING';
  if (raw === 'EVENING') return 'EVENING';
  return null;
}

export type CafeShiftGate = {
  rosteredToday: boolean;
  checkedInToday: boolean;
  checkedOutToday: boolean;
  activeOnShift: boolean;
  portalAccessible: boolean;
  canAcceptOrders: boolean;
  shiftType: string | null;
  checkinAt: string | null;
  checkoutAt: string | null;
  cafeOpenEnd: string;
  portalGraceEnd: string;
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
  const rosterShiftType = normalizeCafeShiftType(rosterRows?.[0]?.shift_type ?? null);

  const { data: checkin } = await supabase
    .from('cafe_staff_checkins')
    .select('checked_in_at, checked_out_at, shift_type')
    .eq('company_id', companyId)
    .eq('employee_id', employee.id)
    .eq('checkin_date', today)
    .maybeSingle();

  const checkedInToday = Boolean(checkin?.checked_in_at);
  const checkedOutToday = Boolean(checkin?.checked_out_at);
  const activeOnShift = checkedInToday && !checkedOutToday;

  const openHours = companyId
    ? await loadCafeOpenHours(supabase, companyId)
    : { openStart: '07:00', openEnd: '19:00' };
  const portalGraceEnd = formatPortalGraceEndTime(openHours.openEnd);
  const portalAccessible =
    activeOnShift && isWithinPortalAccessWindow(openHours.openEnd);

  return {
    rosteredToday,
    checkedInToday,
    checkedOutToday,
    activeOnShift,
    portalAccessible,
    canAcceptOrders: portalAccessible,
    shiftType: normalizeCafeShiftType(checkin?.shift_type ?? null) ?? rosterShiftType,
    checkinAt: checkin?.checked_in_at ?? null,
    checkoutAt: checkin?.checked_out_at ?? null,
    cafeOpenEnd: openHours.openEnd,
    portalGraceEnd,
  };
}
