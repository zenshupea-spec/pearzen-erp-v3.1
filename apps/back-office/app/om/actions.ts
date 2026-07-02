"use server";

import { sweepMissedGuardCheckouts } from '../../../../packages/supabase/guard-auto-checkout';
import { createSupabaseServerClient, createSupabaseServiceClient } from '../../../../packages/supabase/server';
import {
  ATTENDANCE_SELFIES_BUCKET,
  signVerificationPhotoRef,
  SM_VISIT_SELFIES_BUCKET,
} from '../../../../packages/supabase/verification-photo-storage';
import { revalidatePath } from 'next/cache';
import { resolveCompanyIdForSession } from '../../lib/company-context-server';
import {
  fetchAttendanceLogsForVerification,
  colomboTodayIso,
  shiftDateFromDeviceTime,
} from '../../lib/guard-verification-query';
import {
  isOmSectorScopeEmpty,
  omScopeIncludesGuardEmployeeId,
  omScopeIncludesSmEpf,
  omSectorOwnsGuardEpf,
  resolveOmSectorScopeForSession,
  type OmSectorScope,
} from '../../lib/om-sector-scope';
import { auditStaffAction } from '../../lib/staff-audit';
import { getShiftSettings } from '../executive/settings/actions';
import {
  computeShiftTiming,
  deriveAggregateStatus,
  isOnHoldPanelShift,
  isPhotoVerificationQueue,
  isReviewableVerificationShift,
  mergeAttendanceLogIntoShift,
  attachOrphanAutoCheckouts,
  photoRetentionCutoffDate,
  reconcileShiftCheckInOut,
  type ShiftAggregateStatus,
  type ShiftTimingSettings,
} from './shift-verification-utils';

export type VerificationLogRecord = {
  id: string;
  emp_number: string;
  action_type: string;
  device_time: string;
  latitude: number | null;
  longitude: number | null;
  sync_type: string | null;
  photo_url: string | null;
  status: string | null;
};

export type ShiftVerificationRecord = {
  shiftKey: string;
  empNumber: string;
  guardName: string | null;
  shiftDate: string;
  idPhotoUrl: string | null;
  idPhotoCapturedAt: string | null;
  checkIn: VerificationLogRecord | null;
  checkOut: VerificationLogRecord | null;
  hasFlagged: boolean;
  aggregateStatus: ShiftAggregateStatus;
  shiftType: 'DAY' | 'NIGHT' | null;
  isLateStart: boolean;
  isEarlyCheckout: boolean;
  lateMinutes: number | null;
  earlyMinutes: number | null;
};

export type SmVisitVerificationRecord = {
  id: string;
  smEpf: string;
  smName: string | null;
  siteName: string | null;
  visitDate: string;
  visitTime: string;
  photoUrl: string | null;
  idPhotoUrl: string | null;
  idPhotoCapturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: 'PENDING' | 'APPROVED' | 'FLAGGED';
};

function toLogRecord(row: Record<string, unknown>): VerificationLogRecord {
  return {
    id: String(row.id),
    emp_number: String(row.emp_number),
    action_type: String(row.action_type),
    device_time: String(row.device_time),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    sync_type: row.sync_type == null ? null : String(row.sync_type),
    photo_url: row.photo_url == null ? null : String(row.photo_url),
    status: row.status == null ? 'PENDING' : String(row.status),
  };
}

function filterShiftsForOmScope(
  shifts: ShiftVerificationRecord[],
  omScope: OmSectorScope | null,
): ShiftVerificationRecord[] {
  if (omScope === null) return shifts;
  if (isOmSectorScopeEmpty(omScope)) return [];
  return shifts.filter((shift) => omSectorOwnsGuardEpf(omScope, shift.empNumber));
}

function filterSmVisitsForOmScope(
  visits: SmVisitVerificationRecord[],
  omScope: OmSectorScope | null,
): SmVisitVerificationRecord[] {
  if (omScope === null) return visits;
  if (isOmSectorScopeEmpty(omScope)) return [];
  return visits.filter((visit) => omScopeIncludesSmEpf(omScope, visit.smEpf));
}

async function assertOmAttendanceLogIdsAllowed(
  logIds: string[],
): Promise<string | null> {
  const omScope = await resolveOmSectorScopeForSession();
  if (omScope === null) return null;
  if (isOmSectorScopeEmpty(omScope)) {
    return 'No assigned sectors — cannot modify verification records.';
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from('attendance_logs')
    .select('id, emp_number, guard_id')
    .in('id', logIds);

  if (error) return 'Could not verify attendance log scope.';
  if ((rows ?? []).length !== logIds.length) {
    return 'One or more attendance logs were not found.';
  }

  for (const row of rows ?? []) {
    const guardId = row.guard_id as string | null;
    const empNumber = String(row.emp_number ?? '');
    if (guardId && omScopeIncludesGuardEmployeeId(omScope, guardId)) continue;
    if (empNumber && omSectorOwnsGuardEpf(omScope, empNumber)) continue;
    return 'One or more attendance logs are outside your assigned sectors.';
  }

  return null;
}

async function assertOmSmVisitAllowed(visitId: string): Promise<string | null> {
  const omScope = await resolveOmSectorScopeForSession();
  if (omScope === null) return null;
  if (isOmSectorScopeEmpty(omScope)) {
    return 'No assigned sectors — cannot modify SM visit records.';
  }

  const supabase = await createSupabaseServerClient();
  const { data: visit, error } = await supabase
    .from('sm_visit_logs')
    .select('id, sm_epf')
    .eq('id', visitId)
    .maybeSingle();

  if (error || !visit) return 'Visit not found.';
  if (!omScopeIncludesSmEpf(omScope, String(visit.sm_epf ?? ''))) {
    return 'This SM visit is outside your assigned sectors.';
  }

  return null;
}

/** Guard shifts for OM verification (pending, flagged, approved, rejected) for a date. */
export async function getPendingVerificationQueue(
  date?: string,
): Promise<ShiftVerificationRecord[]> {
  const supabase = await createSupabaseServerClient();
  const timingSettings = (await getShiftSettings()) as ShiftTimingSettings;
  const companyId = await resolveCompanyIdForSession(supabase);

  try {
    const service = createSupabaseServiceClient();
    await sweepMissedGuardCheckouts(service, new Date(), companyId);
  } catch (err) {
    console.error('guard auto-checkout sweep failed:', err);
  }

  const service = createSupabaseServiceClient();
  const [logs, omScope] = await Promise.all([
    fetchAttendanceLogsForVerification(service, companyId, date),
    resolveOmSectorScopeForSession(),
  ]);

  if (!logs.length) return [];

  const scopedLogs =
    omScope === null
      ? logs
      : isOmSectorScopeEmpty(omScope)
        ? []
        : logs.filter((log) => omSectorOwnsGuardEpf(omScope, log.emp_number));

  if (!scopedLogs.length) return [];

  const empNumbers = [...new Set(scopedLogs.map((l) => l.emp_number))];
  const { data: employees } = await supabase
    .from('employees')
    .select('emp_number, full_name, id_photo_url, id_photo_captured_at')
    .in('emp_number', empNumbers);

  const employeeByEpf = new Map(
    (employees ?? []).map((e) => [
      e.emp_number as string,
      {
        name: (e.full_name as string | null) ?? null,
        idPhotoUrl: (e.id_photo_url as string | null) ?? null,
        idPhotoCapturedAt: (e.id_photo_captured_at as string | null) ?? null,
      },
    ]),
  );

  const grouped = new Map<string, ShiftVerificationRecord>();

  for (const raw of scopedLogs) {
    const log = toLogRecord(raw as Record<string, unknown>);
    const shiftDate = shiftDateFromDeviceTime(log.device_time);
    const shiftKey = `${log.emp_number}:${shiftDate}`;
    const employee = employeeByEpf.get(log.emp_number);

    let record = grouped.get(shiftKey);
    if (!record) {
      record = {
        shiftKey,
        empNumber: log.emp_number,
        guardName: employee?.name ?? null,
        shiftDate,
        idPhotoUrl: employee?.idPhotoUrl ?? null,
        idPhotoCapturedAt: employee?.idPhotoCapturedAt ?? null,
        checkIn: null,
        checkOut: null,
        hasFlagged: false,
        aggregateStatus: 'PENDING',
        shiftType: null,
        isLateStart: false,
        isEarlyCheckout: false,
        lateMinutes: null,
        earlyMinutes: null,
      };
      grouped.set(shiftKey, record);
    }

    mergeAttendanceLogIntoShift(record, log.action_type, log);

    if (log.status === 'FLAGGED') {
      record.hasFlagged = true;
    }
  }

  attachOrphanAutoCheckouts(grouped);

  for (const record of grouped.values()) {
    reconcileShiftCheckInOut(record);
    record.aggregateStatus = deriveAggregateStatus(
      record.checkIn?.status,
      record.checkOut?.status,
    );
    record.hasFlagged = record.aggregateStatus === 'FLAGGED';
    const timing = computeShiftTiming(record, timingSettings);
    record.shiftType = timing.shiftType;
    record.isLateStart = timing.isLateStart;
    record.isEarlyCheckout = timing.isEarlyCheckout;
    record.lateMinutes = timing.lateMinutes;
    record.earlyMinutes = timing.earlyMinutes;

    if (record.checkIn?.photo_url) {
      record.checkIn.photo_url = await signVerificationPhotoRef(
        service,
        ATTENDANCE_SELFIES_BUCKET,
        record.checkIn.photo_url,
      );
    }
    if (record.checkOut?.photo_url) {
      record.checkOut.photo_url = await signVerificationPhotoRef(
        service,
        ATTENDANCE_SELFIES_BUCKET,
        record.checkOut.photo_url,
      );
    }
  }

  return filterShiftsForOmScope(
    [...grouped.values()].sort((a, b) => b.shiftDate.localeCompare(a.shiftDate)),
    omScope,
  );
}

/** SM visit selfies for OM review on a given date (all verification statuses). */
export async function getSmVisitVerificationQueue(
  date: string,
): Promise<SmVisitVerificationRecord[]> {
  const supabase = await createSupabaseServerClient();
  const omScope = await resolveOmSectorScopeForSession();

  const { data: visits, error } = await supabase
    .from('sm_visit_logs')
    .select(
      'id, sm_epf, site_name, latitude, longitude, photo_url, verification_status, created_at',
    )
    .eq('visit_type', 'VISIT')
    .in('verification_status', ['PENDING', 'APPROVED', 'FLAGGED'])
    .gte('created_at', `${date}T00:00:00`)
    .lt('created_at', `${date}T23:59:59.999`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ SUPABASE ERROR (getSmVisitVerificationQueue):', error.message);
    return [];
  }

  if (!visits?.length) return [];

  const scopedVisits =
    omScope === null
      ? visits
      : isOmSectorScopeEmpty(omScope)
        ? []
        : visits.filter((visit) => omScopeIncludesSmEpf(omScope, String(visit.sm_epf ?? '')));

  if (!scopedVisits.length) return [];

  const smEpfs = [...new Set(scopedVisits.map((v) => v.sm_epf as string))];
  const { data: employees } = await supabase
    .from('employees')
    .select('emp_number, full_name, id_photo_url, id_photo_captured_at')
    .in('emp_number', smEpfs);

  const employeeByEpf = new Map(
    (employees ?? []).map((e) => [
      e.emp_number as string,
      {
        name: (e.full_name as string | null) ?? null,
        idPhotoUrl: (e.id_photo_url as string | null) ?? null,
        idPhotoCapturedAt: (e.id_photo_captured_at as string | null) ?? null,
      },
    ]),
  );

  return filterSmVisitsForOmScope(
    await Promise.all(
      scopedVisits.map(async (raw) => {
    const createdAt = String(raw.created_at);
    const employee = employeeByEpf.get(String(raw.sm_epf));
    const storedPhoto = (raw.photo_url as string | null) ?? null;
    const service = createSupabaseServiceClient();
    const photoUrl = storedPhoto
      ? await signVerificationPhotoRef(service, SM_VISIT_SELFIES_BUCKET, storedPhoto)
      : null;
    return {
      id: String(raw.id),
      smEpf: String(raw.sm_epf),
      smName: employee?.name ?? null,
      siteName: (raw.site_name as string | null) ?? null,
      visitDate: createdAt.slice(0, 10),
      visitTime: createdAt,
      photoUrl,
      idPhotoUrl: employee?.idPhotoUrl ?? null,
      idPhotoCapturedAt: employee?.idPhotoCapturedAt ?? null,
      latitude: raw.latitude == null ? null : Number(raw.latitude),
      longitude: raw.longitude == null ? null : Number(raw.longitude),
      verificationStatus: (raw.verification_status as 'PENDING' | 'APPROVED' | 'FLAGGED') ?? 'PENDING',
    };
    }),
    ),
    omScope,
  );
}

export async function processVerification(logId: string, newStatus: 'APPROVED' | 'FLAGGED') {
  return processShiftVerification([logId], newStatus);
}

const TIMING_CLEARED_TAG = 'TIMING_OK';

/** OM clears a late-start / early-checkout hold so the shift can enter photo verification. */
export async function clearShiftTimingHold(logIds: string[]) {
  if (!logIds.length) {
    return { success: false, error: 'No logs selected.' };
  }

  try {
    const scopeError = await assertOmAttendanceLogIdsAllowed(logIds);
    if (scopeError) return { success: false, error: scopeError };

    const supabase = await createSupabaseServerClient();
    const { data: rows, error: fetchError } = await supabase
      .from('attendance_logs')
      .select('id, sync_type')
      .in('id', logIds);

    if (fetchError) throw fetchError;

    for (const row of rows ?? []) {
      const current = (row.sync_type as string | null) ?? '';
      const next = current.includes(TIMING_CLEARED_TAG)
        ? current
        : current
          ? `${current}|${TIMING_CLEARED_TAG}`
          : TIMING_CLEARED_TAG;

      const { error } = await supabase
        .from('attendance_logs')
        .update({ sync_type: next })
        .eq('id', row.id);

      if (error) throw error;
    }

    await auditStaffAction({
      supabase,
      portal: 'om',
      action: 'Clear Shift Timing Hold',
      targetEntity: `${logIds.length} attendance log(s)`,
      details: { logIds },
    });

    revalidatePath('/om');
    revalidatePath('/tm');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not clear timing hold.';
    return { success: false, error: message };
  }
}

/** Revert a rejected shift back to pending so OM can re-review and release to payroll. */
export async function revertRejectedShift(logIds: string[]) {
  return processShiftVerification(logIds, 'PENDING');
}

/** Dates that have shifts in a given status (for archive calendar navigation). */
export async function getShiftVerificationMarkedDates(
  statuses: ShiftAggregateStatus[],
  lookbackDays = 60,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const companyId = await resolveCompanyIdForSession(supabase);
  const omScope = await resolveOmSectorScopeForSession();
  if (omScope !== null && isOmSectorScopeEmpty(omScope)) return [];

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - lookbackDays);
  const fromStr = from.toISOString().slice(0, 10);

  let markedQuery = supabase
    .from('attendance_logs')
    .select('device_time, status, emp_number')
    .in('status', statuses)
    .gte('device_time', `${fromStr}T00:00:00`)
    .order('device_time', { ascending: false })
    .limit(500);

  if (companyId) {
    markedQuery = markedQuery.eq('company_id', companyId);
  }

  const { data, error } = await markedQuery;

  if (error) {
    console.error('❌ SUPABASE ERROR (getShiftVerificationMarkedDates):', error.message);
    return [];
  }

  const dates = new Set<string>();
  for (const row of data ?? []) {
    if (!statuses.includes(row.status as ShiftAggregateStatus)) continue;
    if (omScope !== null && !omSectorOwnsGuardEpf(omScope, String(row.emp_number ?? ''))) {
      continue;
    }
    dates.add(String(row.device_time).slice(0, 10));
  }
  return [...dates].sort((a, b) => b.localeCompare(a));
}

/** Dates that have SM visits in a given verification status (archive calendar). */
export async function getSmVisitMarkedDates(
  statuses: ('APPROVED' | 'FLAGGED')[],
  lookbackDays = 60,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const omScope = await resolveOmSectorScopeForSession();
  if (omScope !== null && isOmSectorScopeEmpty(omScope)) return [];

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - lookbackDays);
  const fromStr = from.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('sm_visit_logs')
    .select('created_at, verification_status, sm_epf')
    .eq('visit_type', 'VISIT')
    .in('verification_status', statuses)
    .gte('created_at', `${fromStr}T00:00:00`)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('❌ SUPABASE ERROR (getSmVisitMarkedDates):', error.message);
    return [];
  }

  const dates = new Set<string>();
  for (const row of data ?? []) {
    if (!statuses.includes(row.verification_status as 'APPROVED' | 'FLAGGED')) continue;
    if (omScope !== null && !omScopeIncludesSmEpf(omScope, String(row.sm_epf ?? ''))) {
      continue;
    }
    dates.add(String(row.created_at).slice(0, 10));
  }
  return [...dates].sort((a, b) => b.localeCompare(a));
}

/** Shift dates that still have photo review or on-hold work in the lookback window. */
export async function getGuardVerificationUnclearedDates(
  lookbackDays = 60,
): Promise<string[]> {
  const cutoff = photoRetentionCutoffDate();
  const todayStr = colomboTodayIso();
  const shifts = await getPendingVerificationQueue();
  const dates = new Set<string>();

  for (const shift of shifts) {
    if (shift.shiftDate < cutoff || shift.shiftDate > todayStr) {
      continue;
    }
    if (isPhotoVerificationQueue(shift) || isOnHoldPanelShift(shift) || isReviewableVerificationShift(shift)) {
      dates.add(shift.shiftDate);
    }
  }

  return [...dates].sort((a, b) => b.localeCompare(a));
}

/** Visit dates that still have SM verification work in the lookback window. */
export async function getSmVisitUnclearedDates(lookbackDays = 60): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const omScope = await resolveOmSectorScopeForSession();
  if (omScope !== null && isOmSectorScopeEmpty(omScope)) return [];

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - lookbackDays);
  const fromStr = from.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('sm_visit_logs')
    .select('created_at, verification_status, photo_url, sm_epf')
    .eq('visit_type', 'VISIT')
    .in('verification_status', ['PENDING', 'FLAGGED'])
    .gte('created_at', `${fromStr}T00:00:00`)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('❌ SUPABASE ERROR (getSmVisitUnclearedDates):', error.message);
    return [];
  }

  const dates = new Set<string>();
  for (const row of data ?? []) {
    if (omScope !== null && !omScopeIncludesSmEpf(omScope, String(row.sm_epf ?? ''))) {
      continue;
    }
    const visitDate = String(row.created_at).slice(0, 10);
    if (visitDate > todayStr) continue;
    dates.add(visitDate);
  }

  return [...dates].sort((a, b) => b.localeCompare(a));
}

/** APPROVED releases the shift to payroll; FLAGGED keeps it in the OM verification queue. */
export async function processShiftVerification(
  logIds: string[],
  newStatus: 'APPROVED' | 'FLAGGED' | 'REJECTED' | 'PENDING',
) {
  if (!logIds.length) {
    return { success: false, error: 'No logs selected.' };
  }

  try {
    const scopeError = await assertOmAttendanceLogIdsAllowed(logIds);
    if (scopeError) return { success: false, error: scopeError };

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('attendance_logs')
      .update({ status: newStatus })
      .in('id', logIds);

    if (error) throw error;

    await auditStaffAction({
      supabase,
      portal: 'om',
      action: `Shift Verification → ${newStatus}`,
      targetEntity: `${logIds.length} attendance log(s)`,
      details: { logIds, newStatus },
    });

    revalidatePath('/om');
    revalidatePath('/tm');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification update failed.';
    console.error('❌ SUPABASE ERROR (processShiftVerification):', message);
    return { success: false, error: message };
  }
}

/** APPROVED clears the visit from the queue; FLAGGED keeps it for OM review. */
export async function processSmVisitVerification(
  visitId: string,
  newStatus: 'APPROVED' | 'FLAGGED',
) {
  if (!visitId) {
    return { success: false, error: 'No visit selected.' };
  }

  try {
    const scopeError = await assertOmSmVisitAllowed(visitId);
    if (scopeError) return { success: false, error: scopeError };

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from('sm_visit_logs')
      .update({ verification_status: newStatus })
      .eq('id', visitId);

    if (error) throw error;

    await auditStaffAction({
      supabase,
      portal: 'om',
      action: `SM Visit Verification → ${newStatus}`,
      targetEntity: `Visit ${visitId}`,
      details: { visitId, newStatus },
    });

    revalidatePath('/om');
    revalidatePath('/tm');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification update failed.';
    console.error('❌ SUPABASE ERROR (processSmVisitVerification):', message);
    return { success: false, error: message };
  }
}
