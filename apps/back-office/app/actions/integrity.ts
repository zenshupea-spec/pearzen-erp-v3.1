'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';

/** Pending rows for the OM Integrity & Discrepancy queue (45-minute / overlap rule). */
export async function getPendingDiscrepancies(companyId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('attendance_logs')
    .select(
      `
      id,
      guard_id,
      shift_date,
      rostered_start,
      biometric_check_in,
      is_overlap_conflict,
      employees ( first_name, last_name, rank_enum, basic_salary ),
      site_profiles ( site_name )
    `
    )
    .eq('company_id', companyId)
    .eq('status', 'PENDING_RESOLUTION')
    .order('shift_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * OM zero-trust override: trust SM roster time vs biometric device time.
 * Aligns with PRD resolution choices TRUST_FORM / TRUST_CHECK_IN.
 */
export async function resolveDiscrepancy(
  logId: string,
  resolutionType: 'TRUST_FORM' | 'TRUST_CHECK_IN',
  adminId: string
) {
  const supabase = await createSupabaseServerClient();

  const { data: log, error: fetchError } = await supabase
    .from('attendance_logs')
    .select('rostered_start, biometric_check_in, guard_id')
    .eq('id', logId)
    .single();

  if (fetchError || !log) throw new Error('Log not found');

  const finalTime =
    resolutionType === 'TRUST_FORM'
      ? log.rostered_start
      : log.biometric_check_in;

  const { error: updateError } = await supabase
    .from('attendance_logs')
    .update({
      status: 'APPROVED',
      final_approved_time: finalTime,
      resolved_by: adminId,
      resolution_method: resolutionType,
    })
    .eq('id', logId);

  if (updateError) throw new Error(updateError.message);

  await supabase.from('executive_audit_logs').insert({
    action_type: 'TIME_DISCREPANCY_OVERRIDE',
    admin_id: adminId,
    target_guard_id: log.guard_id,
    details: {
      summary: `Resolved conflict for Log ${logId}. Action: ${resolutionType}. Final Time: ${finalTime}`,
    },
  });

  revalidatePath('/om/discrepancies');
  revalidatePath('/om');
  return { success: true as const };
}

/** Fetch the active recovery plan for a specific attendance log, if any. */
export async function getActiveRecoveryPlan(attendanceLogId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('discrepancy_recovery_plans')
    .select('*')
    .eq('attendance_log_id', attendanceLogId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/** Fetch all recovery plans for a log (history view). */
export async function getRecoveryPlanHistory(attendanceLogId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('discrepancy_recovery_plans')
    .select('*')
    .eq('attendance_log_id', attendanceLogId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Fetch all active employees for a company — used by guard selector in recovery plans. */
export async function getCompanyEmployees(companyId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, rank_enum, basic_salary')
    .eq('company_id', companyId)
    .order('first_name');

  if (error) throw new Error(error.message);
  return (data ?? []) as {
    id: string;
    first_name: string;
    last_name: string;
    rank_enum: string;
    basic_salary: number;
  }[];
}

/**
 * Fetch MD compliance settings for the company.
 * Returns the monthly-day divisor (wb_working_days) and the maximum monthly
 * deduction allowed as a percentage of basic salary (max_deduction_pct).
 * Falls back to Sri Lanka Wages Boards Ordinance defaults (26 days, 20%).
 */
export async function getComplianceSettings(companyId: string) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('md_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  const row = data as Record<string, unknown> | null;
  return {
    wb_working_days: (row?.wb_working_days as number) || 26,
    max_deduction_pct: (row?.max_deduction_pct as number) || 20,
    statutory_takehome_floor: (row?.statutory_takehome_floor as number) || 40,
  };
}

type GuardConfig = {
  guard_id: string;
  guard_name: string;
  rank_enum: string;
  percentage: number;
  shifts_per_month: number;
};

/**
 * Create a new recovery plan (or replace the active one).
 * Existing ACTIVE plan for the same log is marked SUPERSEDED.
 */
export async function saveRecoveryPlan({
  attendanceLogId,
  companyId,
  guardId,
  deductionMethod,
  recoveryAmountLkr,
  monthsToRecover,
  shiftsPerMonth,
  perShiftValueLkr,
  guardConfigs,
  notes,
  editorId,
  editorName,
}: {
  attendanceLogId: string;
  companyId: string;
  guardId: string;
  deductionMethod: 'CUT_SHIFTS' | 'MONTHLY';
  recoveryAmountLkr: number;
  monthsToRecover: number;
  shiftsPerMonth?: number;
  perShiftValueLkr?: number;
  guardConfigs?: GuardConfig[];
  notes?: string;
  editorId: string;
  editorName: string;
}) {
  const supabase = await createSupabaseServerClient();

  // Mark any existing ACTIVE plan for this log as SUPERSEDED
  await supabase
    .from('discrepancy_recovery_plans')
    .update({
      status: 'SUPERSEDED',
      updated_by: editorId,
      updated_by_name: editorName,
      updated_at: new Date().toISOString(),
    })
    .eq('attendance_log_id', attendanceLogId)
    .eq('status', 'ACTIVE');

  // Insert the new active plan
  const { error } = await supabase
    .from('discrepancy_recovery_plans')
    .insert({
      attendance_log_id: attendanceLogId,
      company_id: companyId,
      guard_id: guardId,
      deduction_method: deductionMethod,
      recovery_amount_lkr: recoveryAmountLkr,
      months_to_recover: monthsToRecover,
      shifts_per_month: shiftsPerMonth ?? 1,
      per_shift_value_lkr: perShiftValueLkr ?? 0,
      guard_configs: guardConfigs ?? [],
      notes: notes ?? null,
      status: 'ACTIVE',
      created_by: editorId,
      created_by_name: editorName,
    });

  if (error) throw new Error('Failed to save recovery plan: ' + error.message);

  const guardSummary =
    guardConfigs && guardConfigs.length > 1
      ? `${guardConfigs.length} guards`
      : editorName;

  await supabase.from('executive_audit_logs').insert({
    action_type: 'RECOVERY_PLAN_SAVED',
    admin_id: editorId,
    target_guard_id: guardId,
    details: {
      summary: `Recovery plan saved for Log ${attendanceLogId}. Method: ${deductionMethod}. Amount: LKR ${recoveryAmountLkr}. Spread over ${monthsToRecover} month(s). Guards: ${guardSummary}.`,
    },
  });

  revalidatePath('/om/discrepancies');
  return { success: true as const };
}
