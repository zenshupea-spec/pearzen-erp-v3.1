'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access';
import { resolveCompanyIdForSession } from '../../../lib/company-context';
import { getShiftSettings } from '../../executive/settings/actions';
import {
  computeShiftTiming,
  type ShiftTimingSettings,
} from '../shift-verification-utils';
import {
  computeGuardRatings,
  type GuardRawMetrics,
} from './lib/rating';
import type { BlacklistedGuardEntry, GuardCardDisplay } from './types';

export type { BlacklistedGuardEntry, BlacklistVaultEntry, GuardCardDisplay } from './types';

const ROLLING_MONTHS = 12;

function rollingCutoffIso() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - ROLLING_MONTHS);
  return d.toISOString();
}

function shiftDateFromDeviceTime(deviceTime: string): string {
  return deviceTime.slice(0, 10);
}

function maxConsecutiveMissed(rosterDates: string[], attendedDates: Set<string>): number {
  if (!rosterDates.length) return 0;
  const sorted = [...new Set(rosterDates)].sort();
  let max = 0;
  let current = 0;
  for (const date of sorted) {
    if (!attendedDates.has(date)) {
      current += 1;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

async function resolveActorName(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ userId: string | null; name: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, name: 'Unknown' };
  const name =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split('@')[0] ||
    'OM User';
  return { userId: user.id, name };
}

async function fetchUserRole(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = await fetchBackOfficeUserProfile(supabase, user);
  return profile.role;
}

export async function getGuardCardLeaderboard(): Promise<{
  cards: GuardCardDisplay[];
  companyId: string | null;
  isDemo?: boolean;
  error?: string;
}> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) {
    return { cards: [], companyId: null, isDemo: false, error: 'No company context' };
  }

  const cutoff = rollingCutoffIso();
  const cutoffDate = cutoff.slice(0, 10);

  const { data: guards, error: guardError } = await supabase
    .from('employees')
    .select('id, emp_number, full_name, rank, id_photo_url, status, group')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE')
    .order('emp_number', { ascending: true });

  if (guardError) {
    console.error('[GuardCards] employees:', guardError.message);
    return { cards: [], companyId, error: guardError.message };
  }

  if (!guards?.length) {
    return { cards: [], companyId, isDemo: false };
  }

  const empNumbers = guards.map((g) => g.emp_number as string);
  const employeeIds = guards.map((g) => g.id as string);

  const { data: blacklistRows } = await supabase
    .from('guard_blacklist_vault')
    .select('employee_id')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');

  const blacklistedIds = new Set(
    (blacklistRows ?? []).map((r) => r.employee_id as string),
  );

  const activeGuards = guards.filter((g) => !blacklistedIds.has(g.id as string));

  const [
    penaltiesRes,
    deductionsRes,
    logsRes,
    rostersRes,
    timingSettings,
  ] = await Promise.all([
    supabase
      .from('sm_guard_penalties')
      .select('guard_epf, deduction_amount, created_at')
      .in('guard_epf', empNumbers)
      .gte('created_at', cutoff),
    supabase
      .from('payroll_deductions')
      .select('guard_id, amount, created_at')
      .eq('company_id', companyId)
      .in('guard_id', employeeIds)
      .gte('created_at', cutoff),
    supabase
      .from('attendance_logs')
      .select('emp_number, action_type, device_time, sync_type')
      .eq('company_id', companyId)
      .in('emp_number', empNumbers)
      .gte('device_time', cutoff)
      .order('device_time', { ascending: true }),
    supabase
      .from('time_rosters')
      .select('employee_id, shift_date')
      .eq('company_id', companyId)
      .in('employee_id', employeeIds)
      .eq('status', 'ACTIVE')
      .gte('shift_date', cutoffDate),
    getShiftSettings() as Promise<ShiftTimingSettings>,
  ]);

  const penaltyByEpf = new Map<string, { count: number; amount: number }>();
  for (const p of penaltiesRes.data ?? []) {
    const epf = p.guard_epf as string;
    const cur = penaltyByEpf.get(epf) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(p.deduction_amount) || 0;
    penaltyByEpf.set(epf, cur);
  }

  const deductionByEmployeeId = new Map<string, number>();
  for (const d of deductionsRes.data ?? []) {
    const id = d.guard_id as string;
    deductionByEmployeeId.set(
      id,
      (deductionByEmployeeId.get(id) ?? 0) + (Number(d.amount) || 0),
    );
  }

  const logsByShift = new Map<
    string,
    { checkIn?: { device_time: string; sync_type: string | null }; checkOut?: { device_time: string } }
  >();

  for (const log of logsRes.data ?? []) {
    const epf = log.emp_number as string;
    const shiftDate = shiftDateFromDeviceTime(log.device_time as string);
    const key = `${epf}:${shiftDate}`;
    let bucket = logsByShift.get(key);
    if (!bucket) {
      bucket = {};
      logsByShift.set(key, bucket);
    }
    if (log.action_type === 'CHECK_IN') {
      bucket.checkIn = {
        device_time: log.device_time as string,
        sync_type: (log.sync_type as string | null) ?? null,
      };
    } else if (log.action_type === 'CHECK_OUT') {
      bucket.checkOut = { device_time: log.device_time as string };
    }
  }

  const lateByEpf = new Map<string, number>();
  const attendedDatesByEpf = new Map<string, Set<string>>();
  const shiftMonthsByEpf = new Map<string, Set<string>>();

  for (const [key, bucket] of logsByShift) {
    const [epf, shiftDate] = key.split(':');
    if (!attendedDatesByEpf.has(epf)) attendedDatesByEpf.set(epf, new Set());
    attendedDatesByEpf.get(epf)!.add(shiftDate);

    const monthKey = shiftDate.slice(0, 7);
    if (!shiftMonthsByEpf.has(epf)) shiftMonthsByEpf.set(epf, new Set());
    shiftMonthsByEpf.get(epf)!.add(monthKey);

    if (!bucket.checkIn) continue;
    const timing = computeShiftTiming(
      {
        shiftDate,
        checkIn: {
          id: '',
          emp_number: epf,
          action_type: 'CHECK_IN',
          device_time: bucket.checkIn.device_time,
          latitude: null,
          longitude: null,
          sync_type: bucket.checkIn.sync_type,
          photo_url: null,
          status: null,
        },
        checkOut: bucket.checkOut
          ? {
              id: '',
              emp_number: epf,
              action_type: 'CHECK_OUT',
              device_time: bucket.checkOut.device_time,
              latitude: null,
              longitude: null,
              sync_type: null,
              photo_url: null,
              status: null,
            }
          : null,
      },
      timingSettings,
    );

    if (timing.isLateStart) {
      lateByEpf.set(epf, (lateByEpf.get(epf) ?? 0) + 1);
    }
  }

  const rosterDatesByEmployeeId = new Map<string, string[]>();
  for (const r of rostersRes.data ?? []) {
    const eid = r.employee_id as string;
    const list = rosterDatesByEmployeeId.get(eid) ?? [];
    list.push(r.shift_date as string);
    rosterDatesByEmployeeId.set(eid, list);
  }

  const rawMetrics: GuardRawMetrics[] = activeGuards.map((g) => {
    const epf = g.emp_number as string;
    const eid = g.id as string;
    const pen = penaltyByEpf.get(epf) ?? { count: 0, amount: 0 };
    const attended = attendedDatesByEpf.get(epf) ?? new Set<string>();
    const rosterDates = rosterDatesByEmployeeId.get(eid) ?? [];
    const monthCount = shiftMonthsByEpf.get(epf)?.size ?? 0;
    const shiftDays = attended.size;
    const shiftsPerMonth = monthCount > 0 ? shiftDays / monthCount : shiftDays / ROLLING_MONTHS;

    return {
      empNumber: epf,
      penaltyCount12m: pen.count,
      penaltyAmount12m: pen.amount,
      lateCheckIns12m: lateByEpf.get(epf) ?? 0,
      shiftsPerMonth: Math.round(shiftsPerMonth * 10) / 10,
      maxConsecutiveMissedDays: maxConsecutiveMissed(rosterDates, attended),
      deductionTotal12m: (deductionByEmployeeId.get(eid) ?? 0) + pen.amount,
    };
  });

  const rated = computeGuardRatings(rawMetrics);
  const guardByEpf = new Map(activeGuards.map((g) => [g.emp_number as string, g]));

  const cards: GuardCardDisplay[] = rated.map((row) => {
    const g = guardByEpf.get(row.empNumber)!;
    return {
      ...row,
      employeeId: g.id as string,
      fullName: (g.full_name as string) ?? row.empNumber,
      rank: (g.rank as string | null) ?? null,
      idPhotoUrl: (g.id_photo_url as string | null) ?? null,
      isBlacklisted: false,
    };
  });

  return { cards, companyId };
}

export async function getBlacklistedGuards(): Promise<{
  entries: BlacklistedGuardEntry[];
  canApproveRemoval: boolean;
  isDemo?: boolean;
  error?: string;
}> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  const role = await fetchUserRole(supabase);
  const canApproveRemoval = role === 'MD' || role === 'OD';

  if (!companyId) return { entries: [], canApproveRemoval, error: 'No company context' };

  const { data, error } = await supabase
    .from('guard_blacklist_vault')
    .select(
      'id, employee_id, emp_number, guard_name, guard_rank, reason, blacklisted_by_name, blacklisted_at',
    )
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE')
    .order('blacklisted_at', { ascending: false });

  if (error) {
    console.error('[GuardCards] blacklisted:', error.message);
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return {
        entries: [],
        canApproveRemoval,
        isDemo: false,
      };
    }
    return { entries: [], canApproveRemoval, error: error.message };
  }

  if (!(data ?? []).length) {
    return {
      entries: [],
      canApproveRemoval,
      isDemo: false,
    };
  }

  const entries: BlacklistedGuardEntry[] = (data ?? []).map((r) => ({
    id: r.id as string,
    employeeId: r.employee_id as string,
    empNumber: r.emp_number as string,
    guardName: (r.guard_name as string | null) ?? null,
    guardRank: (r.guard_rank as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
    blacklistedByName: (r.blacklisted_by_name as string) ?? '—',
    blacklistedAt: r.blacklisted_at as string,
  }));

  return { entries, canApproveRemoval };
}

/** @deprecated Use getBlacklistedGuards */
export const getBlacklistVault = getBlacklistedGuards;

export async function blacklistGuard(employeeId: string, reason: string) {
  if (employeeId.startsWith('demo-')) {
    return { error: 'Preview mode — blacklist is disabled for demo cards.' };
  }
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { error: 'No company context' };

  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: 'A reason is required for blacklist.' };

  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('id, emp_number, full_name, rank, group, status')
    .eq('id', employeeId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (empError || !employee) return { error: 'Guard not found.' };
  if (employee.group !== 'GUARD') return { error: 'Only field guards can be blacklisted.' };

  const { userId, name } = await resolveActorName(supabase);

  const { error } = await supabase.from('guard_blacklist_vault').insert({
    company_id: companyId,
    employee_id: employee.id,
    emp_number: employee.emp_number,
    guard_name: employee.full_name,
    guard_rank: employee.rank,
    reason: trimmedReason,
    blacklisted_by: userId,
    blacklisted_by_name: name,
    status: 'ACTIVE',
  });

  if (error) {
    if (error.code === '23505') {
      return { error: 'This guard is already blacklisted.' };
    }
    return { error: error.message };
  }

  revalidatePath('/om');
  revalidatePath('/tm');
  revalidatePath('/om/guard-cards');
  revalidatePath('/om/guard-cards/blacklisted');
  return { success: true as const };
}

export async function approveBlacklistRemoval(
  entryId: string,
  mdNotes?: string,
) {
  if (entryId.startsWith('demo-')) {
    return { error: 'Preview mode — blacklist actions are disabled for demo entries.' };
  }
  const supabase = await createSupabaseServerClient();
  const role = await fetchUserRole(supabase);
  if (role !== 'MD' && role !== 'OD') {
    return { error: 'Only Managing Director or Operations Director can approve removal.' };
  }

  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return { error: 'No company context' };

  const { userId, name } = await resolveActorName(supabase);

  const { error } = await supabase
    .from('guard_blacklist_vault')
    .update({
      status: 'REMOVED',
      removed_at: new Date().toISOString(),
      removed_by: userId,
      removed_by_name: name,
      md_removal_notes: mdNotes?.trim() || null,
    })
    .eq('id', entryId)
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');

  if (error) return { error: error.message };

  revalidatePath('/om');
  revalidatePath('/tm');
  revalidatePath('/om/guard-cards');
  revalidatePath('/om/guard-cards/blacklisted');
  return { success: true as const };
}
