'use server';

import { revalidatePath } from 'next/cache';

import { fetchMasterSiteDirectory } from '../../actions/site-directory-actions';
import { loadInternalWorkLocationsForCompany, formatInternalBranchLabel } from '../../../lib/internal-work-locations';
import { listCafeBranchOptions } from '../../../lib/cafe-front-checkin';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  ATTENDANCE_SELFIES_BUCKET,
  signVerificationPhotoRef,
} from '../../../../../packages/supabase/verification-photo-storage';
import type { User } from '@supabase/supabase-js';
import {
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import {
  fetchBackOfficeUserProfile,
  formatHrPortalEditorLabel,
  isHrPortalEditor,
} from '../../../lib/hr-portal-access-server';
import { normalizeEpfNo } from '../../../lib/cafe-front-auth';
import { loadCafeOpenHours } from '../../../lib/cafe-front-checkin';
import {
  computeCafeShiftWindows,
  type CafeShiftWindows,
} from '../../../lib/cafe-shift-hours';
import { auditStaffAction } from '../../../lib/staff-audit';
import { applyApprovedCafeCheckinToPayroll } from '../../executive/cafe/actions';
import {
  clearCafeRosterShiftForDay,
  fetchCafeRosterShifts,
  upsertCafeRosterShift,
} from '../../../lib/cafe-roster-storage';
import {
  buildRollingWindow,
  formatCafeBranchLabel,
  normalizeCafeShiftType,
  rosterCellKey,
  type CafeShiftType,
} from './utils';

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

type HrEditorContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  user: User;
  profile: Awaited<ReturnType<typeof fetchBackOfficeUserProfile>>;
};

type HrEditorGate =
  | { ok: true; ctx: HrEditorContext }
  | { ok: false; error: string };

const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Sign in again and retry.';

async function requireHrEditor(): Promise<HrEditorGate> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  }
  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!isHrPortalEditor(profile.role)) {
    return {
      ok: false,
      error: 'Only HR, MD, OD, or FM can edit the café roster.',
    };
  }
  return { ok: true, ctx: { supabase, user, profile } };
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

  return Promise.all(
    (data ?? []).map(async (row) => {
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
      const storedSelfie = row.selfie_url ? String(row.selfie_url) : null;
      const selfieUrl = storedSelfie
        ? (await signVerificationPhotoRef(db, ATTENDANCE_SELFIES_BUCKET, storedSelfie)) ??
          storedSelfie
        : null;
      return {
        id: String(row.id),
        employeeId: String(row.employee_id),
        employeeName: String(employee?.full_name ?? 'Café Staff'),
        employeeEpf: epfRaw ? normalizeEpfNo(String(epfRaw)) : '—',
        checkinDate: String(row.checkin_date),
        checkedInAt: String(row.checked_in_at ?? ''),
        selfieUrl,
        rosteredOnShift: Boolean(row.rostered_on_shift),
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
      };
    }),
  );
}

async function fetchCafeBranchSites(companyId: string | null): Promise<CafeBranchSite[]> {
  if (!companyId) return [];
  const db = createSupabaseServiceClient();
  const settings = await loadInternalWorkLocationsForCompany(db, companyId);
  const configured = listCafeBranchOptions(settings).map((site) => ({
    id: site.id,
    siteName: site.siteName,
    clientName: site.clientName,
    label: site.label,
  }));

  if (configured.length) {
    return configured.sort((a, b) => a.label.localeCompare(b.label));
  }

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

async function fetchStaffForCafeBranch(
  branchId: string,
  branchLabel: string,
  companyId: string | null,
): Promise<string[]> {
  if (!companyId) return [];

  const db = createSupabaseServiceClient();
  const settings = await loadInternalWorkLocationsForCompany(db, companyId);
  const isMdBranch = settings.cafe.some((loc) => loc.id === branchId);

  if (isMdBranch) {
    let query = db
      .from('employees')
      .select('emp_number, epf_no, epf_num')
      .eq('status', 'ACTIVE')
      .ilike('group', '%CAFE%')
      .ilike('site', branchLabel.trim());
    query = query.eq('company_id', companyId);
    const { data, error } = await query;
    if (error) {
      console.error('[Cafe Roster] cafe employees fetch failed:', error.message);
      return [];
    }
    return (data ?? [])
      .map((row) => employeeDisplayEpf(row as EmployeeRow))
      .filter((epf) => epf.length > 0);
  }

  return fetchSiteStaffEpfs(branchId, companyId);
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

  let shifts: Array<{ guard_id: string; shift_date: string; shift_type: string }> = [];
  try {
    shifts = await fetchCafeRosterShifts(db, {
      branchId: siteProfileId,
      employeeIds,
      windowStart,
      windowEnd,
      companyId,
    });
  } catch (shiftError) {
    console.error(
      '[Cafe Roster] shift fetch failed:',
      shiftError instanceof Error ? shiftError.message : shiftError,
    );
  }

  let leaveQuery = db
    .from('cafe_leave_requests')
    .select('id, employee_id, leave_date, reason, status, requested_at')
    .in('employee_id', employeeIds)
    .gte('leave_date', windowStart)
    .lte('leave_date', windowEnd);
  if (companyId) leaveQuery = leaveQuery.eq('company_id', companyId);

  const [{ data: leaves, error: leaveError }] = await Promise.all([leaveQuery]);
  if (leaveError) {
    console.error('[Cafe Roster] cafe_leave_requests fetch failed:', leaveError.message);
  }

  const scheduledByKey: Record<string, CafeShiftType> = {};
  for (const row of shifts) {
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
    fetchCafeBranchSites(companyId),
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

  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const staffEpfs = await fetchStaffForCafeBranch(
    selectedSiteId,
    formatInternalBranchLabel(selectedSite?.label ?? selectedSite?.siteName ?? ''),
    companyId,
  );
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
    const gate = await requireHrEditor();
    if (!gate.ok) return { ok: false, error: gate.error };
    const { profile, supabase } = gate.ctx;
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

    if (input.decision === 'APPROVED') {
      try {
        await applyApprovedCafeCheckinToPayroll(
          companyId,
          String(row.employee_id),
          String(row.checkin_date),
        );
      } catch (payrollError) {
        await db
          .from('cafe_staff_checkins')
          .update({
            verification_status: 'PENDING',
            verified_at: null,
            verified_by: null,
          })
          .eq('id', input.checkinId)
          .eq('company_id', companyId);
        return {
          ok: false,
          error:
            payrollError instanceof Error
              ? payrollError.message
              : 'Failed to sync approved check-in to payroll day log.',
        };
      }
    }

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
    revalidatePath('/executive/cafe');
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
    const gate = await requireHrEditor();
    if (!gate.ok) return { ok: false, error: gate.error };
    const { profile, supabase } = gate.ctx;
    const companyId = await resolveCompanyScope();
    if (!companyId) return { ok: false, error: 'Could not resolve company for this session.' };

    const db = createSupabaseServiceClient();
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
      await clearCafeRosterShiftForDay(db, {
        branchId: input.siteProfileId,
        companyId,
        employeeId: String(requestRow.employee_id),
        shiftDate: String(requestRow.leave_date),
      });
    }

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
  return saveCafeRosterShifts({
    siteProfileId: input.siteProfileId,
    changes: [
      {
        employeeId: input.employeeId,
        date: input.date,
        shiftType: input.shiftType,
      },
    ],
  });
}

export async function saveCafeRosterShifts(input: {
  siteProfileId: string;
  changes: Array<{
    employeeId: string;
    date: string;
    shiftType: CafeShiftType | null;
  }>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!input.changes.length) return { ok: true };

    const gate = await requireHrEditor();
    if (!gate.ok) return { ok: false, error: gate.error };
    const { profile, supabase } = gate.ctx;
    const companyId = await resolveCompanyScope();
    if (!companyId) return { ok: false, error: 'Could not resolve company for this session.' };

    const db = createSupabaseServiceClient();

    for (const change of input.changes) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(change.date)) {
        return { ok: false, error: 'Invalid date in roster changes.' };
      }

      const { data: leaveRow } = await db
        .from('cafe_leave_requests')
        .select('status')
        .eq('company_id', companyId)
        .eq('employee_id', change.employeeId)
        .eq('leave_date', change.date)
        .maybeSingle();

      if (leaveRow?.status === 'PENDING') {
        return {
          ok: false,
          error: 'Resolve pending leave requests before saving roster changes.',
        };
      }
      if (leaveRow?.status === 'APPROVED') {
        return { ok: false, error: 'Cannot schedule shifts on approved leave days.' };
      }

      try {
        if (change.shiftType) {
          await upsertCafeRosterShift(db, {
            branchId: input.siteProfileId,
            companyId,
            employeeId: change.employeeId,
            shiftDate: change.date,
            shiftType: change.shiftType,
          });
        } else {
          await clearCafeRosterShiftForDay(db, {
            branchId: input.siteProfileId,
            companyId,
            employeeId: change.employeeId,
            shiftDate: change.date,
          });
        }
      } catch (shiftError) {
        return {
          ok: false,
          error:
            shiftError instanceof Error
              ? shiftError.message
              : shiftError &&
                  typeof shiftError === 'object' &&
                  'message' in shiftError &&
                  String((shiftError as { message?: unknown }).message ?? '').trim()
                ? String((shiftError as { message?: unknown }).message)
                : 'Failed to update roster.',
        };
      }
    }

    await auditStaffAction({
      supabase,
      portal: 'hr',
      action: `Save Café Roster (${input.changes.length} change${input.changes.length === 1 ? '' : 's'})`,
      targetEntity: `Branch ${input.siteProfileId}`,
      details: { changeCount: input.changes.length },
    }).catch((auditError) => {
      console.error('[Cafe Roster] audit log failed:', auditError);
    });

    revalidatePath(CAFE_ROSTER_PATH);
    revalidatePath('/cafe-front/roster');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update roster.' };
  }
}
