'use server';

import { revalidatePath } from 'next/cache';

import { fetchMasterSiteDirectory } from '../../actions/site-directory-actions';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
  formatHrPortalEditorLabel,
} from '../../../lib/hr-portal-access';
import { normalizeEpfNo } from '../../../lib/cafe-front-auth';
import { loadCafeOpenHours } from '../../../lib/cafe-front-checkin';
import {
  computeCafeShiftWindows,
  type CafeShiftWindows,
} from '../../../lib/cafe-shift-hours';
import { auditStaffAction } from '../../../lib/staff-audit';
import {
  buildRollingWindow,
  cafeShiftLabel,
  formatCafeBranchLabel,
  normalizeCafeShiftType,
  rosterCellKey,
  type CafeShiftType,
} from './utils';

const CAFE_ROSTER_SHIFT_TYPES = ['MORNING', 'EVENING', 'DAY'] as const;
const CAFE_ROSTER_PATH = '/hr/cafe-roster';

export type CafeBranchSite = {
  id: string;
  siteName: string;
  clientName: string;
  label: string;
};

export type CafeRosterStaff = {
  id: string;
  epf: string;
  fullName: string;
};

export type CafeLeaveRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveDate: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
};

export type { CafeShiftType } from './utils';

export type CafeCheckinVerificationRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEpf: string;
  checkinDate: string;
  checkedInAt: string;
  selfieUrl: string | null;
  rosteredOnShift: boolean;
  latitude: number | null;
  longitude: number | null;
};

export type CafeRosterDeskData = {
  sites: CafeBranchSite[];
  selectedSiteId: string | null;
  windowStart: string;
  days: string[];
  staff: CafeRosterStaff[];
  scheduledByKey: Record<string, CafeShiftType>;
  leaveByKey: Record<string, CafeLeaveRequestRow>;
  pendingLeaves: CafeLeaveRequestRow[];
  pendingCheckinVerifications: CafeCheckinVerificationRow[];
  cafeOpenStart: string;
  cafeOpenEnd: string;
  shiftWindows: CafeShiftWindows;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  emp_number: string | null;
  epf_no: string | null;
  epf_num: string | null;
  status: string | null;
};

function employeeLookupKeys(employee: EmployeeRow): string[] {
  const keys = new Set<string>();
  if (employee.emp_number) keys.add(String(employee.emp_number).trim().toUpperCase());
  if (employee.epf_no) keys.add(normalizeEpfNo(String(employee.epf_no)));
  if (employee.epf_num) keys.add(normalizeEpfNo(String(employee.epf_num)));
  return [...keys];
}

function employeeDisplayEpf(employee: EmployeeRow): string {
  const epf = employee.epf_no ?? employee.epf_num;
  if (epf) return normalizeEpfNo(String(epf));
  if (employee.emp_number) return String(employee.emp_number).trim().toUpperCase();
  return '—';
}

async function requireHrEditor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');
  const profile = await fetchBackOfficeUserProfile(supabase, user);
  assertHrPortalEditor(profile.role);
  return { supabase, user, profile };
}

async function resolveCompanyScope() {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

async function fetchPendingCafeCheckinVerifications(
  companyId: string | null,
): Promise<CafeCheckinVerificationRow[]> {
  const db = createSupabaseServiceClient();
  let query = db
    .from('cafe_staff_checkins')
    .select(
      'id, employee_id, checkin_date, checked_in_at, selfie_url, rostered_on_shift, latitude, longitude, employees(full_name, epf_no, epf_num, emp_number)',
    )
    .eq('verification_status', 'PENDING')
    .order('checked_in_at', { ascending: false })
    .limit(50);

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) {
    console.error('[Cafe Roster] cafe_staff_checkins verification fetch failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const employee = row.employees as
      | {
          full_name?: string | null;
          epf_no?: string | null;
          epf_num?: string | null;
          emp_number?: string | null;
        }
      | null
      | undefined;
    const epfRaw =
      employee?.epf_no ?? employee?.epf_num ?? employee?.emp_number ?? '';
    return {
      id: String(row.id),
      employeeId: String(row.employee_id),
      employeeName: String(employee?.full_name ?? 'Café Staff'),
      employeeEpf: epfRaw ? normalizeEpfNo(String(epfRaw)) : '—',
      checkinDate: String(row.checkin_date),
      checkedInAt: String(row.checked_in_at ?? ''),
      selfieUrl: row.selfie_url ? String(row.selfie_url) : null,
      rosteredOnShift: Boolean(row.rostered_on_shift),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
    };
  });
}

async function fetchCafeBranchSites(): Promise<CafeBranchSite[]> {
  const { sites } = await fetchMasterSiteDirectory();

  return sites
    .filter((site) => site.siteKind === 'cafe_branch' && site.status === 'ACTIVE')
    .map((site) => ({
      id: site.id,
      siteName: site.siteName,
      clientName: site.clientName,
      label: formatCafeBranchLabel(site.siteName, site.clientName),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchSiteStaffEpfs(siteProfileId: string, companyId: string | null): Promise<string[]> {
  const db = createSupabaseServiceClient();
  let query = db
    .from('site_staff_assignments')
    .select('staff_epf')
    .eq('site_profile_id', siteProfileId)
    .order('created_at', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) {
    console.error('[Cafe Roster] site_staff_assignments fetch failed:', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => String(row.staff_epf ?? '').trim().toUpperCase())
    .filter((epf) => epf.length > 0);
}

async function fetchEmployeesForStaffEpfs(
  staffEpfs: string[],
  companyId: string | null,
): Promise<CafeRosterStaff[]> {
  if (!staffEpfs.length) return [];

  const db = createSupabaseServiceClient();
  let query = db
    .from('employees')
    .select('id, full_name, emp_number, epf_no, epf_num, status')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) {
    console.error('[Cafe Roster] employees fetch failed:', error.message);
    return [];
  }

  const epfSet = new Set(staffEpfs);
  return (data ?? [])
    .filter((row) => employeeLookupKeys(row as EmployeeRow).some((key) => epfSet.has(key)))
    .map((row) => ({
      id: String(row.id),
      epf: employeeDisplayEpf(row as EmployeeRow),
      fullName: String(row.full_name ?? employeeDisplayEpf(row as EmployeeRow)),
    }));
}

async function fetchRosterAndLeave(
  siteProfileId: string,
  employeeIds: string[],
  days: string[],
  staffById: Map<string, CafeRosterStaff>,
  companyId: string | null,
): Promise<{
  scheduledByKey: Record<string, CafeShiftType>;
  leaveByKey: Record<string, CafeLeaveRequestRow>;
  pendingLeaves: CafeLeaveRequestRow[];
}> {
  if (!employeeIds.length || !days.length) {
    return { scheduledByKey: {}, leaveByKey: {}, pendingLeaves: [] };
  }

  const db = createSupabaseServiceClient();
  const windowStart = days[0];
  const windowEnd = days[days.length - 1];

  let shiftQuery = db
    .from('rostered_shifts')
    .select('guard_id, shift_date, shift_type')
    .eq('sector_id', siteProfileId)
    .in('guard_id', employeeIds)
    .gte('shift_date', windowStart)
    .lte('shift_date', windowEnd);
  if (companyId) shiftQuery = shiftQuery.eq('company_id', companyId);

  let leaveQuery = db
    .from('cafe_leave_requests')
    .select('id, employee_id, leave_date, reason, status, requested_at')
    .in('employee_id', employeeIds)
    .gte('leave_date', windowStart)
    .lte('leave_date', windowEnd);
  if (companyId) leaveQuery = leaveQuery.eq('company_id', companyId);

  const [{ data: shifts, error: shiftError }, { data: leaves, error: leaveError }] =
    await Promise.all([shiftQuery, leaveQuery]);

  if (shiftError) {
    console.error('[Cafe Roster] rostered_shifts fetch failed:', shiftError.message);
  }
  if (leaveError) {
    console.error('[Cafe Roster] cafe_leave_requests fetch failed:', leaveError.message);
  }

  const scheduledByKey: Record<string, CafeShiftType> = {};
  for (const row of shifts ?? []) {
    const shiftType = normalizeCafeShiftType(String(row.shift_type));
    if (!shiftType) continue;
    scheduledByKey[rosterCellKey(String(row.guard_id), String(row.shift_date))] = shiftType;
  }

  const leaveByKey: Record<string, CafeLeaveRequestRow> = {};
  const pendingLeaves: CafeLeaveRequestRow[] = [];

  for (const row of leaves ?? []) {
    const employeeId = String(row.employee_id);
    const leaveDate = String(row.leave_date);
    const staff = staffById.get(employeeId);
    const mapped: CafeLeaveRequestRow = {
      id: String(row.id),
      employeeId,
      employeeName: staff?.fullName ?? employeeId,
      leaveDate,
      reason: String(row.reason ?? ''),
      status: row.status as CafeLeaveRequestRow['status'],
      requestedAt: String(row.requested_at ?? ''),
    };
    leaveByKey[rosterCellKey(employeeId, leaveDate)] = mapped;
    if (mapped.status === 'PENDING') pendingLeaves.push(mapped);
  }

  pendingLeaves.sort(
    (a, b) => a.leaveDate.localeCompare(b.leaveDate) || a.requestedAt.localeCompare(b.requestedAt),
  );

  return { scheduledByKey, leaveByKey, pendingLeaves };
}

export async function getCafeRosterDeskData(input?: {
  siteProfileId?: string | null;
  windowStart?: string | null;
}): Promise<CafeRosterDeskData> {
  const companyId = await resolveCompanyScope();
  const [sites, pendingCheckinVerifications] = await Promise.all([
    fetchCafeBranchSites(),
    fetchPendingCafeCheckinVerifications(companyId),
  ]);
  const { windowStart, days } = buildRollingWindow(input?.windowStart);

  const selectedSiteId =
    input?.siteProfileId && sites.some((site) => site.id === input.siteProfileId)
      ? input.siteProfileId
      : (sites[0]?.id ?? null);

  const db = createSupabaseServiceClient();
  const openHours = companyId
    ? await loadCafeOpenHours(db, companyId)
    : { openStart: '07:00', openEnd: '19:00' };
  const shiftWindows = computeCafeShiftWindows(openHours.openStart, openHours.openEnd);

  if (!selectedSiteId) {
    return {
      sites,
      selectedSiteId: null,
      windowStart,
      days,
      staff: [],
      scheduledByKey: {},
      leaveByKey: {},
      pendingLeaves: [],
      pendingCheckinVerifications,
      cafeOpenStart: openHours.openStart,
      cafeOpenEnd: openHours.openEnd,
      shiftWindows,
    };
  }

  const staffEpfs = await fetchSiteStaffEpfs(selectedSiteId, companyId);
  const staff = await fetchEmployeesForStaffEpfs(staffEpfs, companyId);
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const employeeIds = staff.map((member) => member.id);

  const roster = await fetchRosterAndLeave(
    selectedSiteId,
    employeeIds,
    days,
    staffById,
    companyId,
  );

  return {
    sites,
    selectedSiteId,
    windowStart,
    days,
    staff,
    ...roster,
    pendingCheckinVerifications,
    cafeOpenStart: openHours.openStart,
    cafeOpenEnd: openHours.openEnd,
    shiftWindows,
  };
}

export async function reviewCafeCheckinVerification(input: {
  checkinId: string;
  decision: 'APPROVED' | 'FLAGGED';
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { profile, supabase } = await requireHrEditor();
    const companyId = await resolveCompanyScope();
    if (!companyId) return { ok: false, error: 'Could not resolve company for this session.' };

    const db = createSupabaseServiceClient();
    const reviewer = profile.full_name
      ? formatHrPortalEditorLabel(profile.full_name, profile.role)
      : profile.role;

    const { data: row, error: fetchError } = await db
      .from('cafe_staff_checkins')
      .select('id, verification_status, employee_id, checkin_date, selfie_url')
      .eq('id', input.checkinId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (fetchError || !row) {
      return { ok: false, error: 'Check-in record not found.' };
    }
    if (row.verification_status !== 'PENDING') {
      return { ok: false, error: 'This check-in has already been reviewed.' };
    }

    const { error: updateError } = await db
      .from('cafe_staff_checkins')
      .update({
        verification_status: input.decision,
        verified_at: new Date().toISOString(),
        verified_by: reviewer,
      })
      .eq('id', input.checkinId)
      .eq('company_id', companyId);

    if (updateError) return { ok: false, error: updateError.message };

    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: `Café Check-in ${input.decision}`,
      targetEntity: `Check-in ${input.checkinId}`,
      actorName: reviewer,
      actorRole: profile.role,
      details: { checkinId: input.checkinId, decision: input.decision },
    });

    revalidatePath(CAFE_ROSTER_PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to review check-in.' };
  }
}

export async function reviewCafeLeaveRequest(input: {
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
  siteProfileId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { profile } = await requireHrEditor();
    const companyId = await resolveCompanyScope();
    if (!companyId) return { ok: false, error: 'Could not resolve company for this session.' };

    const db = createSupabaseServiceClient();
    assertHrPortalEditor(profile.role);
    const reviewer = profile.full_name
      ? formatHrPortalEditorLabel(profile.full_name, profile.role)
      : profile.role;

    const { data: requestRow, error: fetchError } = await db
      .from('cafe_leave_requests')
      .select('id, employee_id, leave_date, status')
      .eq('id', input.requestId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (fetchError || !requestRow) {
      return { ok: false, error: 'Leave request not found.' };
    }
    if (requestRow.status !== 'PENDING') {
      return { ok: false, error: 'This leave request has already been reviewed.' };
    }

    const { error: updateError } = await db
      .from('cafe_leave_requests')
      .update({
        status: input.decision,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewer,
      })
      .eq('id', input.requestId)
      .eq('company_id', companyId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    if (input.decision === 'APPROVED') {
      await db
        .from('rostered_shifts')
        .delete()
        .eq('company_id', companyId)
        .eq('sector_id', input.siteProfileId)
        .eq('guard_id', requestRow.employee_id)
        .eq('shift_date', requestRow.leave_date);
    }

    const supabase = await createSupabaseServerClient();
    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: `Café Leave ${input.decision}`,
      targetEntity: `Request ${input.requestId}`,
      actorName: reviewer,
      actorRole: profile.role,
    });

    revalidatePath(CAFE_ROSTER_PATH);
    revalidatePath('/cafe-front/roster');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to review leave.' };
  }
}

export async function setCafeRosterShift(input: {
  siteProfileId: string;
  employeeId: string;
  date: string;
  shiftType: CafeShiftType | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireHrEditor();
    const companyId = await resolveCompanyScope();
    if (!companyId) return { ok: false, error: 'Could not resolve company for this session.' };

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: 'Invalid date.' };
    }

    const db = createSupabaseServiceClient();

    const { data: leaveRow } = await db
      .from('cafe_leave_requests')
      .select('status')
      .eq('company_id', companyId)
      .eq('employee_id', input.employeeId)
      .eq('leave_date', input.date)
      .maybeSingle();

    if (leaveRow?.status === 'PENDING') {
      return { ok: false, error: 'Resolve the pending leave request before changing this day.' };
    }
    if (leaveRow?.status === 'APPROVED') {
      return { ok: false, error: 'This day is approved leave.' };
    }

    const { error: clearError } = await db
      .from('rostered_shifts')
      .delete()
      .eq('company_id', companyId)
      .eq('sector_id', input.siteProfileId)
      .eq('guard_id', input.employeeId)
      .eq('shift_date', input.date)
      .in('shift_type', [...CAFE_ROSTER_SHIFT_TYPES]);
    if (clearError) return { ok: false, error: clearError.message };

    if (input.shiftType) {
      const { error } = await db.from('rostered_shifts').insert({
        company_id: companyId,
        sector_id: input.siteProfileId,
        guard_id: input.employeeId,
        shift_date: input.date,
        shift_type: input.shiftType,
      });
      if (error) return { ok: false, error: error.message };
    }

    const supabase = await createSupabaseServerClient();
    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: input.shiftType
        ? `Schedule Café ${cafeShiftLabel(input.shiftType)} Shift`
        : 'Remove Café Shift',
      targetEntity: `Employee ${input.employeeId} · ${input.date}`,
      details: input,
    });

    revalidatePath(CAFE_ROSTER_PATH);
    revalidatePath('/cafe-front/roster');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update roster.' };
  }
}
