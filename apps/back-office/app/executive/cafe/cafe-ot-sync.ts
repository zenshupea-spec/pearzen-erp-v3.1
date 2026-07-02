'use server';

import { evaluatePayFormula } from '../../../../../packages/pay-formulas';
import { normalizeCafeOpenTime } from '../../../../../packages/cafe-open-hours';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

import { accrueCafeOtFromCheckin, cafeShiftHoursFromMinutes } from '../../../lib/cafe-ot-accrual';
import {
  cafeIsoWeekRange,
} from '../../../lib/cafe-weekly-ot';
import {
  cafeWorkDateFromCheckin,
} from '../../../lib/cafe-checkin-payroll-sync';
import { getMdEngineConstants } from '../settings/engine-constants-actions';
import { getPayFormulasSettings } from '../settings/pay-formulas-actions';

export type CafeOtCap = {
  otHours: number;
  otLkr: number;
};

async function loadCafeOtRateForEmployee(employeeId: string): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { data: emp } = await supabase
    .from('employees')
    .select('base_salary, basic_salary')
    .eq('id', employeeId)
    .maybeSingle();

  const basic = Number(emp?.base_salary ?? emp?.basic_salary ?? 0) || 45_000;
  const formulas = await getPayFormulasSettings();
  return evaluatePayFormula(formulas.cafe.otRatePerHour, { B: basic, HRS: 9 });
}

function timeHmToMinutes(hhmm: string): number {
  const normalized = normalizeCafeOpenTime(hhmm, '19:00');
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

function isoToLocalMinutes(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NaN;
  return d.getHours() * 60 + d.getMinutes();
}

/** Sum shift hours (cutoff-clipped) for prior days in the ISO week — feeds weekly OT threshold. */
async function loadWeeklyShiftHoursBefore(
  companyId: string,
  employeeId: string,
  workDate: string,
  cafeOtCutoffTime: string,
): Promise<number> {
  const { weekStart } = cafeIsoWeekRange(workDate);
  if (workDate <= weekStart) return 0;

  const supabase = createSupabaseServiceClient();
  const { data: checkins, error } = await supabase
    .from('cafe_staff_checkins')
    .select('checkin_date, checked_in_at, checked_out_at')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .gte('checkin_date', weekStart)
    .lt('checkin_date', workDate);

  if (error) throw new Error(error.message);

  const cutoffMinutes = timeHmToMinutes(cafeOtCutoffTime);
  let total = 0;

  for (const row of checkins ?? []) {
    if (!row.checked_in_at || !row.checked_out_at) continue;
    total += cafeShiftHoursFromMinutes({
      checkinMinutes: isoToLocalMinutes(row.checked_in_at),
      checkoutMinutes: isoToLocalMinutes(row.checked_out_at),
      cutoffMinutes,
    });
  }

  return Math.round(total * 100) / 100;
}

export async function resolveMaxCafeOtForWorkDay(
  companyId: string,
  employeeId: string,
  workDate: string,
): Promise<CafeOtCap | null> {
  const supabase = createSupabaseServiceClient();
  const { data: checkin } = await supabase
    .from('cafe_staff_checkins')
    .select('checked_in_at, checked_out_at')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('checkin_date', workDate)
    .maybeSingle();

  if (!checkin?.checked_in_at || !checkin.checked_out_at) return null;

  const engine = await getMdEngineConstants();
  const [otRatePerHour, weeklyHoursBefore] = await Promise.all([
    loadCafeOtRateForEmployee(employeeId),
    loadWeeklyShiftHoursBefore(companyId, employeeId, workDate, engine.cafeOtCutoffTime),
  ]);

  const accrued = accrueCafeOtFromCheckin({
    checkedInAt: checkin.checked_in_at,
    checkedOutAt: checkin.checked_out_at,
    cafeOtCutoffTime: engine.cafeOtCutoffTime,
    otRatePerHour,
    weeklyHoursBefore,
    cafeWeeklyOtThresholdHours: engine.cafeWeeklyOtThresholdHours,
  });

  return { otHours: accrued.otHours, otLkr: accrued.otLkr };
}

/** Accrue OT from check-in/out and upsert `cafe_staff_day_logs` (checkout + HR approve). */
export async function syncCafeOtDayLogFromCheckin(
  companyId: string,
  employeeId: string,
  workDateInput: string,
  options?: { markWorked?: boolean },
): Promise<void> {
  const workDate = cafeWorkDateFromCheckin(workDateInput);
  const supabase = createSupabaseServiceClient();

  const { data: checkin, error: checkinError } = await supabase
    .from('cafe_staff_checkins')
    .select('checked_in_at, checked_out_at, verification_status')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('checkin_date', workDate)
    .maybeSingle();

  if (checkinError) throw new Error(checkinError.message);

  const engine = await getMdEngineConstants();
  const [otRatePerHour, weeklyHoursBefore] = await Promise.all([
    loadCafeOtRateForEmployee(employeeId),
    loadWeeklyShiftHoursBefore(companyId, employeeId, workDate, engine.cafeOtCutoffTime),
  ]);

  const accrued = accrueCafeOtFromCheckin({
    checkedInAt: checkin?.checked_in_at ?? '',
    checkedOutAt: checkin?.checked_out_at,
    cafeOtCutoffTime: engine.cafeOtCutoffTime,
    otRatePerHour,
    weeklyHoursBefore,
    cafeWeeklyOtThresholdHours: engine.cafeWeeklyOtThresholdHours,
  });

  const { data: existing, error: existingError } = await supabase
    .from('cafe_staff_day_logs')
    .select('worked')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('work_date', workDate)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  const markWorked =
    options?.markWorked === true ||
    (options?.markWorked !== false && checkin?.verification_status === 'APPROVED');

  const { error: upsertError } = await supabase.from('cafe_staff_day_logs').upsert(
    {
      company_id: companyId,
      employee_id: employeeId,
      work_date: workDate,
      worked: markWorked ? true : Boolean(existing?.worked),
      ot_hours: accrued.otHours,
      ot_lkr: accrued.otLkr,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'employee_id,work_date' },
  );

  if (upsertError) throw new Error(upsertError.message);
}
