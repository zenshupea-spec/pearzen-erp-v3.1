'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { resolveGuardRosterKey } from '../../../lib/employee-epf';
import {
  assertHrPortalEditor,
  fetchBackOfficeUserProfile,
} from '../../../lib/hr-portal-access-server';
import { fetchActiveSectorManagersForCompany } from '../../../lib/sector-manager-roster';
import type {
  SectorManagerRoster,
  TempGuard,
  TempGuardStatus,
  TempShiftEntry,
} from './types';
import { TEMP_SHIFT_RATE_LKR } from './utils';

export type TempRosterDeskData = {
  sectorManagers: SectorManagerRoster[];
  guards: TempGuard[];
  shiftRateLkr: number;
};

type ShadowSlotRow = {
  temp_id: string;
  sequence_num: number;
  sm_epf: string;
  field_identity: string;
  status: string;
  active_from: string;
  active_to: string | null;
  archived_at: string | null;
  merged_to_employee_id: string | null;
};

type AttendanceRow = {
  guard_epf: string;
  site_name: string;
  shift_type: string;
  shift_date: string;
  status: string;
};

function formatSiteShift(siteName: string, shiftType: string): string {
  const label = shiftType === 'NIGHT' ? 'Night' : 'Day';
  return `${siteName} — ${label}`;
}

function buildShiftAggregates(rows: AttendanceRow[]) {
  const historyByGuard = new Map<string, Map<string, number>>();
  const monthlyByGuard = new Map<string, Record<string, number>>();

  for (const row of rows) {
    if (row.status === 'CANCELLED') continue;
    const tempId = row.guard_epf;
    const siteKey = formatSiteShift(row.site_name, row.shift_type);

    const history = historyByGuard.get(tempId) ?? new Map<string, number>();
    history.set(siteKey, (history.get(siteKey) ?? 0) + 1);
    historyByGuard.set(tempId, history);

    const monthKey = row.shift_date.slice(0, 7);
    const monthly = monthlyByGuard.get(tempId) ?? {};
    monthly[monthKey] = (monthly[monthKey] ?? 0) + 1;
    monthlyByGuard.set(tempId, monthly);
  }

  return { historyByGuard, monthlyByGuard };
}

function mapSlotToGuard(
  slot: ShadowSlotRow,
  historyByGuard: Map<string, Map<string, number>>,
  monthlyByGuard: Map<string, Record<string, number>>,
): TempGuard {
  const historyMap = historyByGuard.get(slot.temp_id) ?? new Map<string, number>();
  const shiftHistory: TempShiftEntry[] = [...historyMap.entries()]
    .map(([site, shifts]) => ({ site, shifts }))
    .sort((a, b) => b.shifts - a.shifts);

  return {
    id: slot.temp_id,
    sequence: slot.sequence_num,
    smId: slot.sm_epf,
    fieldIdentity: slot.field_identity || '—',
    status: slot.status as TempGuardStatus,
    activeFrom: slot.active_from,
    activeTo: slot.active_to,
    shiftHistory,
    accruedPay: 0,
    monthlyShiftCounts: monthlyByGuard.get(slot.temp_id) ?? {},
    archivedAt: slot.archived_at?.slice(0, 10),
    mergedToEmpId: slot.merged_to_employee_id ?? undefined,
  };
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

async function fetchSectorManagers(companyId: string | null): Promise<SectorManagerRoster[]> {
  const db = createSupabaseServiceClient();
  const managers = await fetchActiveSectorManagersForCompany(db, companyId);
  return managers.map((row) => ({
    smId: row.epf_number,
    name: row.full_name,
    sector: row.site,
  }));
}

async function fetchShadowSlots(companyId: string | null): Promise<ShadowSlotRow[]> {
  const db = createSupabaseServiceClient();
  let query = db
    .from('shadow_roster_slots')
    .select(
      'temp_id, sequence_num, sm_epf, field_identity, status, active_from, active_to, archived_at, merged_to_employee_id',
    )
    .order('sequence_num', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    console.error('[Shadow Roster] slot fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as ShadowSlotRow[];
}

async function fetchAttendanceForTemps(tempIds: string[]): Promise<AttendanceRow[]> {
  if (!tempIds.length) return [];
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from('sm_guard_attendance')
    .select('guard_epf, site_name, shift_type, shift_date, status')
    .in('guard_epf', tempIds);
  if (error) {
    console.error('[Shadow Roster] attendance fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as AttendanceRow[];
}

export async function getTempRosterDeskData(): Promise<TempRosterDeskData> {
  const companyId = await resolveCompanyScope();
  const [sectorManagers, slots] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchSectorManagers, companyId),
    fetchWithRosterCompanyFallback(fetchShadowSlots, companyId),
  ]);

  const tempIds = slots.map((s) => s.temp_id);
  const attendance = await fetchAttendanceForTemps(tempIds);
  const { historyByGuard, monthlyByGuard } = buildShiftAggregates(attendance);

  const guards = slots.map((slot) => mapSlotToGuard(slot, historyByGuard, monthlyByGuard));

  return {
    sectorManagers,
    guards,
    shiftRateLkr: TEMP_SHIFT_RATE_LKR,
  };
}

export async function addTempGuardAction(smEpf: string): Promise<{ guard?: TempGuard; error?: string }> {
  try {
    await requireHrEditor();
    const companyId = await resolveCompanyScope();
    if (!companyId) return { error: 'Could not resolve company for this session.' };

    const db = createSupabaseServiceClient();
    const smId = smEpf.trim().toUpperCase();

    const { data: seqRow, error: seqError } = await db
      .from('shadow_roster_slots')
      .select('sequence_num')
      .eq('company_id', companyId)
      .order('sequence_num', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seqError) {
      console.error('[Shadow Roster] sequence lookup failed:', seqError.message);
      return { error: 'Failed to allocate temp ID.' };
    }

    const sequence = (seqRow?.sequence_num ?? 0) + 1;
    const tempId = `TEMP-${String(sequence).padStart(5, '0')}`;
    const today = new Date().toISOString().slice(0, 10);

    const { data: inserted, error: insertError } = await db
      .from('shadow_roster_slots')
      .insert({
        company_id: companyId,
        temp_id: tempId,
        sequence_num: sequence,
        sm_epf: smId,
        field_identity: '—',
        status: 'ACTIVE',
        active_from: today,
      })
      .select(
        'temp_id, sequence_num, sm_epf, field_identity, status, active_from, active_to, archived_at, merged_to_employee_id',
      )
      .single();

    if (insertError || !inserted) {
      console.error('[Shadow Roster] insert failed:', insertError?.message);
      return { error: 'Failed to create temp guard slot.' };
    }

    revalidatePath('/hr/temp-roster');
    return {
      guard: mapSlotToGuard(inserted as ShadowSlotRow, new Map(), new Map()),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add temp guard.' };
  }
}

export async function removeTempGuardAction(tempId: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireHrEditor();
    const companyId = await resolveCompanyScope();
    if (!companyId) return { error: 'Could not resolve company for this session.' };

    const db = createSupabaseServiceClient();
    const attendance = await fetchAttendanceForTemps([tempId]);
    const activeShifts = attendance.filter((r) => r.status !== 'CANCELLED').length;
    if (activeShifts > 0) {
      return { error: 'Cannot remove a temp with logged shifts. Archive or merge first.' };
    }

    const { error } = await db
      .from('shadow_roster_slots')
      .delete()
      .eq('company_id', companyId)
      .eq('temp_id', tempId)
      .eq('status', 'ACTIVE');

    if (error) {
      console.error('[Shadow Roster] delete failed:', error.message);
      return { error: 'Failed to remove temp guard slot.' };
    }

    revalidatePath('/hr/temp-roster');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove temp guard.' };
  }
}

export async function archiveTempGuardAction(tempId: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireHrEditor();
    const companyId = await resolveCompanyScope();
    if (!companyId) return { error: 'Could not resolve company for this session.' };

    const today = new Date().toISOString().slice(0, 10);
    const db = createSupabaseServiceClient();

    const { error } = await db
      .from('shadow_roster_slots')
      .update({
        status: 'ARCHIVED',
        active_to: today,
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('temp_id', tempId)
      .eq('status', 'ACTIVE');

    if (error) {
      console.error('[Shadow Roster] archive failed:', error.message);
      return { error: 'Failed to archive temp guard.' };
    }

    revalidatePath('/hr/temp-roster');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to archive temp guard.' };
  }
}

export type RosterMergeResult =
  | { success: true }
  | { success: false; error: string };

export async function executeRosterMerge(
  tempEmpId: string,
  permEmpId: string,
): Promise<RosterMergeResult> {
  try {
    await requireHrEditor();
    const companyId = await resolveCompanyScope();
    const db = createSupabaseServiceClient();
    const tempId = tempEmpId.trim().toUpperCase();

    if (!tempId) {
      return { success: false, error: 'Temp guard id is required.' };
    }

    let slotQuery = db
      .from('shadow_roster_slots')
      .select('temp_id, status, company_id')
      .eq('temp_id', tempId)
      .maybeSingle();
    if (companyId) slotQuery = slotQuery.eq('company_id', companyId);

    const { data: slot, error: slotError } = await slotQuery;
    if (slotError) {
      console.error('[Shadow Roster] merge slot lookup failed:', slotError.message);
      return { success: false, error: 'Failed to verify temp guard slot.' };
    }
    if (!slot || slot.status !== 'ACTIVE') {
      return {
        success: false,
        error: 'Temp guard slot is not active or was already merged.',
      };
    }

    let employeeQuery = db
      .from('employees')
      .select('id, company_id, emp_number, epf_no, epf_num')
      .eq('id', permEmpId)
      .maybeSingle();
    if (companyId) employeeQuery = employeeQuery.eq('company_id', companyId);

    const { data: employee, error: employeeError } = await employeeQuery;
    if (employeeError || !employee) {
      console.error('[Shadow Roster] merge employee lookup failed:', employeeError?.message);
      return { success: false, error: 'Permanent employee not found for this tenant.' };
    }

    const permRosterKey = resolveGuardRosterKey(employee);
    if (!permRosterKey) {
      return {
        success: false,
        error:
          'Permanent employee needs an EPF or employee number before merging shadow roster history.',
      };
    }

    const storedEmpNumber = String(employee.emp_number ?? '').trim().toUpperCase();
    if (storedEmpNumber !== permRosterKey) {
      const { error: syncError } = await db
        .from('employees')
        .update({ emp_number: permRosterKey })
        .eq('id', permEmpId);
      if (syncError) {
        console.error('[Shadow Roster] emp_number sync failed:', syncError.message);
        return { success: false, error: 'Failed to align employee roster key before merge.' };
      }
    }

    const { error } = await db.rpc('merge_shadow_roster_profile', {
      p_temp_emp_id: tempId,
      p_perm_emp_id: permEmpId,
    });

    if (error) {
      console.error('\n[SHADOW ROSTER] MERGE FAILED:', error.message, '\n');
      return { success: false, error: 'Failed to merge shadow roster profile.' };
    }

    const { count: orphanCount, error: orphanError } = await db
      .from('sm_guard_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('guard_epf', tempId);

    if (orphanError) {
      console.error('[Shadow Roster] orphan attendance check failed:', orphanError.message);
    } else if ((orphanCount ?? 0) > 0) {
      return {
        success: false,
        error: 'Merge completed but temp attendance rows were left behind.',
      };
    }

    revalidatePath('/hr/temp-roster');
    revalidatePath('/hr/mnr');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to merge shadow roster.',
    };
  }
}
