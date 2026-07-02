'use server';

/**
 * MD/OD sector → OM assignment actions (SectorTile dropdown on CV Operations).
 *
 * Implementation steps: CVS_MD_SECTOR_OM_ASSIGNMENT_STEPS.txt
 *   Step 03 — getSectorOmAssignmentBoard, assignSectorOmAction, clearSectorOmAction
 *
 * Assign/clear delegate to sector-role-assignments.ts (sector_role_assignments).
 * Assignment key = SM canonical EPF (`sectorManagerEpfKey`), not geographic sector name.
 */

import {
  fetchActiveOmRankEmployeesForCompany,
} from '../../../lib/head-office-corporate-staff';
import { fetchBackOfficeUserProfile } from '../../../lib/hr-portal-access-server';
import {
  canManageSectorOmAssignments,
  mapOmRankCandidates,
  type SectorOmAssignmentBoard,
} from '../../../lib/om-sector-assignment-spec';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { resolveExecutiveCompanyId } from '../../executive/settings/lib/executive-md-settings-db';
import { fetchSectorOmAssignmentsForCompany } from '../../../lib/om-sector-assignment-data';
import {
  assignSectorRoleAction,
  clearSectorRoleAction,
} from './sector-role-assignments';

export type {
  SectorOmAssignmentBoard,
  SectorOmAssignmentBoardOmCandidate,
  SectorOmAssignmentRow,
  SectorOmAssignmentView,
  SectorOmAssignedOm,
} from '../../../lib/om-sector-assignment-spec';

export async function getSectorOmAssignmentBoard(): Promise<
  SectorOmAssignmentBoard | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const profile = await fetchBackOfficeUserProfile(supabase, user);
  const canAssign = canManageSectorOmAssignments(profile.role);

  let companyId: string;
  try {
    companyId = await resolveExecutiveCompanyId(supabase);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Tenant context required.',
    };
  }

  const staff = await fetchActiveOmRankEmployeesForCompany(companyId);
  const omCandidates = mapOmRankCandidates(staff);
  const assignmentsBySmEpf = await fetchSectorOmAssignmentsForCompany(companyId);

  return {
    omCandidates,
    assignmentsBySmEpf,
    sessionRole: profile.role,
    canAssign,
  };
}

export async function assignSectorOmAction(input: {
  smEpf: string;
  omEmployeeId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  return assignSectorRoleAction({
    smEpf: input.smEpf,
    roleCode: 'OM',
    employeeId: input.omEmployeeId,
  });
}

export async function clearSectorOmAction(input: {
  smEpf: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  return clearSectorRoleAction({
    smEpf: input.smEpf,
    roleCode: 'OM',
  });
}
