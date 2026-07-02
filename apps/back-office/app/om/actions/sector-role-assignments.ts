'use server';

/**
 * MD/OD sector role assignments — Staff Command Center sector board.
 *
 * Step file: MD_PORTAL_STAFF_COMMAND_CENTER_STEPS.txt (Step 05)
 * Table: sector_role_assignments (Step 14 read cutover — OM scope + field radar).
 */

import { revalidatePath } from 'next/cache';

import { assertExecutivePortalSecurityGate } from '../../../lib/executive-portal-server-gate';
import { isHeadOfficeWorkforceStatus } from '../../../lib/head-office-corporate-staff';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import {
  employeeRankMatchesSectorRole,
  mapAllSectorRoleCandidates,
  normalizeSectorRoleAssignmentSmEpf,
  normalizeSectorRoleCode,
  canManageSectorRoleAssignments,
  SECTOR_ROLE_ASSIGNMENTS_TABLE,
  type SectorAssignmentRoleCode,
  type SectorRoleAssignmentBoard,
} from '../../../lib/sector-role-assignment-spec';
import {
  fetchActiveSectorRoleStaffForCompany,
  fetchSectorRoleAssignmentsForCompany,
} from '../../../lib/sector-role-assignment-data';
import { auditStaffAction } from '../../../lib/staff-audit';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import {
  getMdSettingsDb,
  resolveExecutiveCompanyId,
} from '../../executive/settings/lib/executive-md-settings-db';
import { getLiveFieldRadar } from './field-radar';

export type {
  SectorAssignmentRoleCode,
  SectorRoleAssignmentBoard,
  SectorRoleAssignmentCandidate,
  SectorRoleAssignmentSectorCard,
  SectorRoleAssignee,
} from '../../../lib/sector-role-assignment-spec';

function revalidateSectorRoleAssignmentConsumers() {
  revalidatePath('/executive/access');
  revalidatePath('/executive/operations');
  revalidatePath('/om');
  revalidatePath('/om/sites/guards');
  revalidatePath('/hr/mnr');
}

async function assertSectorRoleAssignmentActor() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' as const };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  if (!canManageSectorRoleAssignments(profile.role)) {
    return { error: 'Only MD or OD can manage sector assignments.' as const };
  }

  const portalGate = await assertExecutivePortalSecurityGate();
  if (!portalGate.ok) return { error: portalGate.error as const };

  return {
    supabase,
    profile,
    user,
    editorLabel:
      profile.full_name?.trim() ||
      user.email?.split('@')[0] ||
      'Executive',
    editorRole: profile.role,
    sessionEmployeeId: profile.employeeId ?? null,
  };
}

async function fetchActiveSectorRoleEmployee(
  companyId: string,
  employeeId: string,
  roleCode: SectorAssignmentRoleCode,
) {
  const db = getMdSettingsDb();
  const { data, error } = await db
    .from('employees')
    .select('id, full_name, email, status, rank, company_id')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle();

  if (error || !data) return { error: 'Employee not found.' as const };
  if (!isHeadOfficeWorkforceStatus(data.status)) {
    return { error: 'Employee is not active.' as const };
  }
  if (!employeeRankMatchesSectorRole(data.rank as string | undefined, roleCode)) {
    return {
      error: `Choose an active employee with rank ${roleCode}.`,
    } as const;
  }

  return {
    employee: {
      id: String(data.id),
      fullName:
        typeof data.full_name === 'string' && data.full_name.trim()
          ? data.full_name.trim()
          : 'Unnamed staff',
      email: typeof data.email === 'string' ? data.email.trim() : null,
      rank: roleCode,
    },
  };
}

function buildSectorCards(
  assignmentsBySmEpf: Awaited<ReturnType<typeof fetchSectorRoleAssignmentsForCompany>>,
  radarSectors: Awaited<ReturnType<typeof getLiveFieldRadar>>['sectors'],
) {
  const radarBySmEpf = new Map(
    radarSectors
      .map((sector) => {
        const smEpf = normalizeSectorRoleAssignmentSmEpf(sector.smEpf);
        return smEpf ? ([smEpf, sector] as const) : null;
      })
      .filter((entry): entry is [string, (typeof radarSectors)[number]] => entry !== null),
  );

  const smEpfKeys = new Set<string>([
    ...radarBySmEpf.keys(),
    ...Object.keys(assignmentsBySmEpf),
  ]);

  return [...smEpfKeys]
    .sort((a, b) => a.localeCompare(b))
    .map((smEpf) => {
      const live = radarBySmEpf.get(smEpf);
      const smLabel =
        live?.sm && live.sm !== '—'
          ? live.sm
          : live?.name?.trim() || smEpf;
      const regionLabel =
        live?.region?.trim() && live.region !== 'Unassigned portfolio'
          ? live.region.trim()
          : live?.region?.trim() || '—';

      return {
        smEpf,
        smLabel,
        regionLabel,
        assignments: assignmentsBySmEpf[smEpf] ?? {},
      };
    });
}

export async function getSectorRoleAssignmentBoard(): Promise<
  SectorRoleAssignmentBoard | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const canAssign = canManageSectorRoleAssignments(profile.role);

  let companyId: string;
  try {
    companyId = await resolveExecutiveCompanyId(supabase);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Tenant context required.',
    };
  }

  const [staff, assignmentsBySmEpf, radar] = await Promise.all([
    fetchActiveSectorRoleStaffForCompany(companyId),
    fetchSectorRoleAssignmentsForCompany(companyId),
    getLiveFieldRadar(),
  ]);

  return {
    sectors: buildSectorCards(assignmentsBySmEpf, radar.sectors),
    candidatesByRole: mapAllSectorRoleCandidates(staff),
    sessionRole: profile.role,
    canAssign,
  };
}

export async function assignSectorRoleAction(input: {
  smEpf: string;
  roleCode: string;
  employeeId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const actor = await assertSectorRoleAssignmentActor();
    if ('error' in actor) return { success: false, error: actor.error };

    const smEpf = normalizeSectorRoleAssignmentSmEpf(input.smEpf);
    if (!smEpf) {
      return { success: false, error: 'Invalid sector manager key.' };
    }

    const roleCode = normalizeSectorRoleCode(input.roleCode);
    if (!roleCode) {
      return { success: false, error: 'Invalid sector role.' };
    }

    const employeeId = String(input.employeeId ?? '').trim();
    if (!employeeId) {
      return { success: false, error: `Choose a ${roleCode} employee.` };
    }

    const companyId = await resolveExecutiveCompanyId(actor.supabase);
    const employeeResult = await fetchActiveSectorRoleEmployee(
      companyId,
      employeeId,
      roleCode,
    );
    if ('error' in employeeResult) {
      return { success: false, error: employeeResult.error };
    }

    const { employee } = employeeResult;
    const db = getMdSettingsDb();
    const { error } = await db.from(SECTOR_ROLE_ASSIGNMENTS_TABLE).upsert(
      {
        company_id: companyId,
        sm_epf: smEpf,
        role_code: roleCode,
        employee_id: employee.id,
        assigned_by_employee_id: actor.sessionEmployeeId,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,sm_epf,role_code' },
    );

    if (error) {
      return { success: false, error: error.message };
    }

    await auditStaffAction({
      supabase: actor.supabase,
      portal: 'hq',
      action: 'Sector Role Assigned',
      targetEntity: `SM ${smEpf} · ${roleCode} → ${employee.fullName} (${employee.id})`,
      actorName: actor.editorLabel,
      actorRole: actor.editorRole ?? 'MD',
      details: {
        smEpf,
        roleCode,
        employeeId: employee.id,
        employeeFullName: employee.fullName,
      },
    });

    revalidateSectorRoleAssignmentConsumers();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not assign sector role.',
    };
  }
}

export async function clearSectorRoleAction(input: {
  smEpf: string;
  roleCode: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const actor = await assertSectorRoleAssignmentActor();
    if ('error' in actor) return { success: false, error: actor.error };

    const smEpf = normalizeSectorRoleAssignmentSmEpf(input.smEpf);
    if (!smEpf) {
      return { success: false, error: 'Invalid sector manager key.' };
    }

    const roleCode = normalizeSectorRoleCode(input.roleCode);
    if (!roleCode) {
      return { success: false, error: 'Invalid sector role.' };
    }

    const companyId = await resolveExecutiveCompanyId(actor.supabase);
    const db = getMdSettingsDb();

    const { data: existing, error: readError } = await db
      .from(SECTOR_ROLE_ASSIGNMENTS_TABLE)
      .select('employee_id')
      .eq('company_id', companyId)
      .eq('sm_epf', smEpf)
      .eq('role_code', roleCode)
      .maybeSingle();

    if (readError) {
      return { success: false, error: readError.message };
    }
    if (!existing) {
      return { success: true };
    }

    const { error } = await db
      .from(SECTOR_ROLE_ASSIGNMENTS_TABLE)
      .delete()
      .eq('company_id', companyId)
      .eq('sm_epf', smEpf)
      .eq('role_code', roleCode);

    if (error) {
      return { success: false, error: error.message };
    }

    await auditStaffAction({
      supabase: actor.supabase,
      portal: 'hq',
      action: 'Sector Role Cleared',
      targetEntity: `SM ${smEpf} · ${roleCode}`,
      actorName: actor.editorLabel,
      actorRole: actor.editorRole ?? 'MD',
      details: {
        smEpf,
        roleCode,
        previousEmployeeId: existing.employee_id,
      },
    });

    revalidateSectorRoleAssignmentConsumers();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not clear sector role.',
    };
  }
}
