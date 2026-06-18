'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveGuardRosterKey } from '../../../lib/employee-epf';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { auditStaffAction } from '../../../lib/staff-audit';
import { getShiftSettings } from '../../executive/settings/actions';
import {
  computeShiftTiming,
  type ShiftTimingSettings,
} from '../shift-verification-utils';
import {
  computeGuardRatings,
  ratingTier,
  type GuardRawMetrics,
} from './lib/rating';
import type { BlacklistedGuardEntry, GuardCardDisplay } from './types';

export type { BlacklistedGuardEntry, BlacklistVaultEntry, GuardCardDisplay } from './types';

const ROLLING_MONTHS = 12;
const GUARD_GROUPS = ['GUARD', 'GUARD_FIELD'] as const;

type GuardEmployeeRow = {
  id: string;
  company_id: string | null;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | number | null;
  full_name: string | null;
  rank: string | null;
  id_photo_url: string | null;
  status: string | null;
  group: string | null;
  site: string | null;
};

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeSmEpf(value: unknown): string | null {
  const raw = value == null ? '' : String(value).trim().toUpperCase();
  return raw || null;
}

async function fetchGuardSectorContext(companyId: string | null): Promise<{
  guardSmLinks: Map<string, string>;
  smSectorByEpf: Map<string, string>;
  siteSmByKey: Map<string, string>;
}> {
  const supabase = await createSupabaseServerClient();

  let siteQuery = supabase
    .from('site_profiles')
    .select('site_name, assigned_sm_epf')
    .neq('site_status', 'ARCHIVED');
  if (companyId) siteQuery = siteQuery.eq('company_id', companyId);

  let smQuery = supabase
    .from('employees')
    .select('emp_number, epf_no, epf_num, site')
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE');
  if (companyId) smQuery = smQuery.eq('company_id', companyId);

  const [linksRes, siteRes, smRes] = await Promise.all([
    supabase.from('sm_guard_assignments').select('sm_epf, guard_epf'),
    siteQuery,
    smQuery,
  ]);

  const guardSmLinks = new Map<string, string>();
  for (const row of linksRes.data ?? []) {
    const guardEpf = String(row.guard_epf).trim().toUpperCase();
    const smEpf = normalizeSmEpf(row.sm_epf);
    if (!guardEpf || !smEpf) continue;
    guardSmLinks.set(guardEpf, smEpf);
  }

  const siteSmByKey = new Map<string, string>();
  for (const row of siteRes.data ?? []) {
    const smEpf = normalizeSmEpf(row.assigned_sm_epf);
    if (!smEpf) continue;
    siteSmByKey.set(normalizeSiteKey(String(row.site_name)), smEpf);
  }

  const smSectorByEpf = new Map<string, string>();
  for (const row of smRes.data ?? []) {
    const sector = String(row.site ?? '').trim();
    if (!sector) continue;
    for (const key of [row.emp_number, row.epf_no, row.epf_num != null ? String(row.epf_num) : '']) {
      const normalized = String(key).trim().toUpperCase();
      if (normalized) smSectorByEpf.set(normalized, sector);
    }
  }

  return { guardSmLinks, smSectorByEpf, siteSmByKey };
}

function resolveGuardSector(
  guard: GuardEmployeeRow,
  context: {
    guardSmLinks: Map<string, string>;
    smSectorByEpf: Map<string, string>;
    siteSmByKey: Map<string, string>;
  },
): string | null {
  const rosterKey = resolveGuardRosterKey(guard);
  const linkedSmEpf = rosterKey ? context.guardSmLinks.get(rosterKey) : null;
  if (linkedSmEpf) {
    const linkedSector = context.smSectorByEpf.get(linkedSmEpf);
    if (linkedSector) return linkedSector;
  }

  const siteName = guard.site?.trim() || null;
  if (siteName) {
    const siteSmEpf = context.siteSmByKey.get(normalizeSiteKey(siteName));
    if (siteSmEpf) {
      const siteSector = context.smSectorByEpf.get(siteSmEpf);
      if (siteSector) return siteSector;
    }
  }

  return null;
}

async function fetchActiveGuardRows(companyId: string | null): Promise<GuardEmployeeRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('employees')
    .select(
      'id, company_id, emp_number, epf_no, epf_num, full_name, rank, id_photo_url, status, group, site',
    )
    .in('group', [...GUARD_GROUPS])
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) {
    console.error('[GuardCards] employees:', error.message);
    return [];
  }

  const { decryptEmployeePiiRecord } = await import('../../../lib/employee-pii');
  return (data ?? []).map((row) => decryptEmployeePiiRecord(row)) as GuardEmployeeRow[];
}

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
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  if (!sessionCompanyId) {
    return { cards: [], companyId: null, isDemo: false, error: 'No company context' };
  }

  const cutoff = rollingCutoffIso();
  const cutoffDate = cutoff.slice(0, 10);

  const guards = await fetchWithRosterCompanyFallback(fetchActiveGuardRows, sessionCompanyId);

  if (!guards.length) {
    return { cards: [], companyId: sessionCompanyId, isDemo: false };
  }

  const rosterCompany =
    guards.find((g) => g.company_id)?.company_id ?? rosterCompanyId(sessionCompanyId);
  const sectorContext = await fetchGuardSectorContext(rosterCompany);

  const { data: blacklistRows } = await supabase
    .from('guard_blacklist_vault')
    .select('employee_id')
    .eq('company_id', rosterCompany)
    .eq('status', 'ACTIVE');

  const blacklistedIds = new Set(
    (blacklistRows ?? []).map((r) => r.employee_id as string),
  );

  const activeGuards = guards.filter(
    (g) => !blacklistedIds.has(g.id) && Boolean(resolveGuardRosterKey(g)),
  );

  if (!activeGuards.length) {
    return { cards: [], companyId: sessionCompanyId, isDemo: false };
  }

  const activeRosterKeys = activeGuards.map((g) => resolveGuardRosterKey(g));
  const activeEmployeeIds = activeGuards.map((g) => g.id);

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
      .in('guard_epf', activeRosterKeys)
      .gte('created_at', cutoff),
    supabase
      .from('payroll_deductions')
      .select('guard_id, amount, created_at')
      .eq('company_id', rosterCompany)
      .in('guard_id', activeEmployeeIds)
      .gte('created_at', cutoff),
    supabase
      .from('attendance_logs')
      .select('emp_number, action_type, device_time, sync_type')
      .eq('company_id', rosterCompany)
      .in('emp_number', activeRosterKeys)
      .gte('device_time', cutoff)
      .order('device_time', { ascending: true }),
    supabase
      .from('time_rosters')
      .select('employee_id, shift_date')
      .eq('company_id', rosterCompany)
      .in('employee_id', activeEmployeeIds)
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
    const epf = resolveGuardRosterKey(g);
    const eid = g.id;
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
  const ratedByEpf = new Map(rated.map((row) => [row.empNumber, row]));

  const cards: GuardCardDisplay[] = activeGuards
    .map((g) => {
      const rosterKey = resolveGuardRosterKey(g);
      const row = ratedByEpf.get(rosterKey);
      if (!row) return null;
      return {
        ...row,
        employeeId: g.id,
        fullName: (g.full_name as string) ?? rosterKey,
        rank: (g.rank as string | null) ?? null,
        sector: resolveGuardSector(g, sectorContext),
        site: g.site?.trim() || null,
        idPhotoUrl: (g.id_photo_url as string | null) ?? null,
        isBlacklisted: false,
      };
    })
    .filter((card): card is GuardCardDisplay => card != null)
    .sort((a, b) => b.rating - a.rating);

  return { cards, companyId: sessionCompanyId };
}

/** Rolling 12-month guard score for specific employees (includes resigned guards). */
export async function getGuardRatingMapByEmployeeId(
  targetEmployeeIds: string[],
): Promise<Record<string, { rating: number; tier: ReturnType<typeof ratingTier> }>> {
  if (!targetEmployeeIds.length) return {};

  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  if (!companyId) return {};

  const targetSet = new Set(targetEmployeeIds);

  const { data: guards, error: guardError } = await supabase
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, rank, status, group')
    .eq('company_id', companyId)
    .in('group', [...GUARD_GROUPS]);

  if (guardError || !guards?.length) return {};

  const cohort = guards.filter((g) => resolveGuardRosterKey(g));
  const rosterKeys = cohort.map((g) => resolveGuardRosterKey(g));
  const employeeIds = cohort.map((g) => g.id as string);

  const cutoff = rollingCutoffIso();
  const cutoffDate = cutoff.slice(0, 10);

  const [penaltiesRes, deductionsRes, logsRes, rostersRes, timingSettings] = await Promise.all([
    supabase
      .from('sm_guard_penalties')
      .select('guard_epf, deduction_amount, created_at')
      .in('guard_epf', rosterKeys)
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
      .in('emp_number', rosterKeys)
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

  const rawMetrics: GuardRawMetrics[] = cohort.map((g) => {
    const epf = resolveGuardRosterKey(g);
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
  const guardByEpf = new Map(cohort.map((g) => [resolveGuardRosterKey(g), g]));
  const result: Record<string, { rating: number; tier: ReturnType<typeof ratingTier> }> = {};

  for (const row of rated) {
    const guard = guardByEpf.get(row.empNumber);
    if (!guard || !targetSet.has(guard.id as string)) continue;
    result[guard.id as string] = {
      rating: row.rating,
      tier: ratingTier(row.rating),
    };
  }

  return result;
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
  if (!GUARD_GROUPS.includes(employee.group as (typeof GUARD_GROUPS)[number])) {
    return { error: 'Only field guards can be blacklisted.' };
  }

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

  await auditStaffAction({
    supabase,
    portal: 'om',
    action: 'Blacklist Guard',
    targetEntity: `${employee.full_name ?? employee.emp_number} (${employee.emp_number})`,
    details: { employeeId, reason: trimmedReason },
  });

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

  await auditStaffAction({
    supabase,
    portal: 'om',
    action: 'Approve Blacklist Removal',
    targetEntity: `Vault entry ${entryId}`,
    details: { entryId, mdNotes: mdNotes?.trim() || null },
  });

  revalidatePath('/om');
  revalidatePath('/tm');
  revalidatePath('/om/guard-cards');
  revalidatePath('/om/guard-cards/blacklisted');
  return { success: true as const };
}
