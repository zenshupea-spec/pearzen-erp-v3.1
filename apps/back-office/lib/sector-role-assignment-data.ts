import 'server-only';

import { createSupabaseServiceClient } from '../../../packages/supabase/service';
import { isHeadOfficeWorkforceStatus } from './head-office-corporate-staff';
import {
  indexSectorRoleAssignments,
  isSectorRoleAssignmentRoleCode,
  SECTOR_ASSIGNMENT_ROLE_CODES,
  SECTOR_ROLE_ASSIGNMENTS_TABLE,
  type SectorAssignmentRoleCode,
  type SectorRoleAssignmentsByRole,
} from './sector-role-assignment-spec';
import { resolveEmployeeEpfNo } from './om-sector-assignment-spec';
import { getMdSettingsDb } from '../app/executive/settings/lib/executive-md-settings-db';

export type SectorRoleStaffRow = {
  id: string;
  fullName: string;
  email: string | null;
  rank: string | null;
  epfNo: string | null;
};

function mapSectorRoleStaffRow(row: {
  id: unknown;
  full_name?: unknown;
  rank?: unknown;
  email?: unknown;
  status?: unknown;
  epf_no?: unknown;
  epf_num?: unknown;
  emp_number?: unknown;
}): SectorRoleStaffRow {
  return {
    id: String(row.id),
    fullName:
      typeof row.full_name === 'string' && row.full_name.trim()
        ? row.full_name.trim()
        : 'Unnamed staff',
    rank: typeof row.rank === 'string' ? row.rank.trim().toUpperCase() : null,
    email: typeof row.email === 'string' ? row.email.trim() : null,
    epfNo: resolveEmployeeEpfNo(row),
  };
}

/** Active employees eligible for sector role pickers (rank matches slot). */
export async function fetchActiveSectorRoleStaffForCompany(
  companyId: string,
): Promise<SectorRoleStaffRow[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, rank, email, status, epf_no, epf_num, emp_number')
    .eq('company_id', companyId)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[sector-role-assignments] staff fetch:', error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => isHeadOfficeWorkforceStatus(row.status))
    .filter((row) => isSectorRoleAssignmentRoleCode(row.rank as string | undefined))
    .map(mapSectorRoleStaffRow);
}

/** sm_epf → role_code → assignee from sector_role_assignments. */
export async function fetchSectorRoleAssignmentsForCompany(
  companyId: string,
): Promise<Record<string, SectorRoleAssignmentsByRole>> {
  const db = getMdSettingsDb();
  const { data: rows, error } = await db
    .from(SECTOR_ROLE_ASSIGNMENTS_TABLE)
    .select('sm_epf, role_code, employee_id')
    .eq('company_id', companyId);

  if (error) {
    console.error('[sector-role-assignments] fetch:', error.message);
    return {};
  }

  const staff = await fetchActiveSectorRoleStaffForCompany(companyId);
  const profileById = new Map(
    staff.map(
      (person) =>
        [
          person.id,
          {
            fullName: person.fullName,
            epfNo: person.epfNo,
            rank: person.rank,
          },
        ] as const,
    ),
  );

  const missingIds = (rows ?? [])
    .map((row) => String(row.employee_id ?? '').trim())
    .filter((employeeId) => employeeId && !profileById.has(employeeId));

  if (missingIds.length > 0) {
    const { data: fallbackRows } = await db
      .from('employees')
      .select('id, full_name, rank, epf_no, epf_num, emp_number')
      .eq('company_id', companyId)
      .in('id', [...new Set(missingIds)]);

    for (const row of fallbackRows ?? []) {
      const employeeId = String(row.id ?? '').trim();
      if (!employeeId || profileById.has(employeeId)) continue;
      profileById.set(employeeId, {
        fullName:
          typeof row.full_name === 'string' && row.full_name.trim()
            ? row.full_name.trim()
            : 'Staff',
        epfNo: resolveEmployeeEpfNo(row),
        rank:
          typeof row.rank === 'string' ? row.rank.trim().toUpperCase() : null,
      });
    }
  }

  const enriched = (rows ?? []).map((row) => {
    const employeeId = String(row.employee_id ?? '').trim();
    const profile = profileById.get(employeeId);
    return {
      sm_epf: String(row.sm_epf ?? ''),
      role_code: String(row.role_code ?? ''),
      employee_id: employeeId,
      full_name: profile?.fullName ?? null,
      epf_no: profile?.epfNo,
      emp_number: profile?.epfNo,
    };
  });

  return indexSectorRoleAssignments(enriched);
}

export { SECTOR_ASSIGNMENT_ROLE_CODES, type SectorAssignmentRoleCode };
