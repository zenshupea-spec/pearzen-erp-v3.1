/**
 * Sector role assignments — MD Portal Staff Command Center (Step 03).
 * Step file: MD_PORTAL_STAFF_COMMAND_CENTER_STEPS.txt
 *
 * SCHEMA CHOICE (Option A — locked Step 03)
 * -----------------------------------------
 * New table `sector_role_assignments` generalizes `sector_om_assignments`:
 *
 *   sector_role_assignments (
 *     id                      uuid PK,
 *     company_id              uuid NOT NULL → companies,
 *     sm_epf                  text NOT NULL,
 *     role_code               text NOT NULL CHECK (role_code IN ('OM','FM','HR','TM','AD','EA')),
 *     employee_id             uuid NOT NULL → employees,
 *     assigned_by_employee_id uuid → employees,
 *     assigned_at             timestamptz NOT NULL DEFAULT now(),
 *     UNIQUE (company_id, sm_epf, role_code)
 *   )
 *
 * Migration (Step 04):
 *   · INSERT INTO sector_role_assignments … SELECT … FROM sector_om_assignments
 *     with role_code = 'OM', employee_id = om_employee_id.
 *   · Keep `sector_om_assignments` for historical backfill only; reads use sector_role_assignments (Step 14).
 *
 * ASSIGNMENT KEY — unchanged from om-sector-assignment-spec.ts
 * ------------------------------------------------------------
 * `sm_epf` = canonical SM key (sectorManagerEpfKey / field-radar canonicalKey).
 * NOT geographic sector name · NOT café guard_sector_assignments.sector_id.
 *
 * CARDINALITY
 * -----------
 * · At most **one assignee per role per SM portfolio**:
 *     UNIQUE (company_id, sm_epf, role_code)
 * · Same employee may appear on multiple sectors (multi-sector OM/FM/etc.).
 * · `__unassigned__` bucket: no assignment rows; sector card omitted or read-only.
 *
 * SCOPE ENFORCEMENT (today)
 * -------------------------
 * · **OM** — server scope lock enforced (om-sector-scope.ts); reads OM rows from sector_role_assignments.
 * · **FM, HR, TM, AD, EA** — assignment stored for MD Portal sector board; portal scope
 *   rules deferred (Step 01 out of scope). Do not break OM scope when reading OM rows.
 *
 * ACTORS
 * ------
 * MD/OD only may assign/clear (same gate as sector OM assignments).
 */

import {
  SECTOR_ASSIGNMENT_ROLE_CODES,
  type SectorAssignmentRoleCode,
} from './md-portal-staff-command-center-spec';
import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';
import {
  formatOmCandidateLabel,
  normalizeSectorOmAssignmentSmEpf,
  resolveEmployeeEpfNo,
  SECTOR_OM_ASSIGNMENTS_TABLE,
} from './om-sector-assignment-spec';

export {
  SECTOR_ASSIGNMENT_ROLE_CODES,
  type SectorAssignmentRoleCode,
} from './md-portal-staff-command-center-spec';

export type SectorRoleAssignmentSmEpf = string;

/** Supabase table name (Step 04 migration). */
export const SECTOR_ROLE_ASSIGNMENTS_TABLE = 'sector_role_assignments' as const;

/** Legacy OM-only table — backfill source; no longer read after Step 14 cutover. */
export { SECTOR_OM_ASSIGNMENTS_TABLE };

export type SectorRoleAssignmentRow = {
  id: string;
  company_id: string;
  /** Canonical SM key — same normalization as sector_om_assignments.sm_epf. */
  sm_epf: SectorRoleAssignmentSmEpf;
  role_code: SectorAssignmentRoleCode;
  employee_id: string;
  assigned_by_employee_id: string | null;
  assigned_at: string;
};

export type SectorRoleAssignee = {
  employeeId: string;
  fullName: string;
  epfNo: string | null;
  rank: SectorAssignmentRoleCode;
};

export type SectorRoleAssignmentCandidate = SectorRoleAssignee & {
  email: string | null;
};

/** Per-sector assignments keyed by role_code (null role omitted from map). */
export type SectorRoleAssignmentsByRole = Partial<
  Record<SectorAssignmentRoleCode, SectorRoleAssignee>
>;

export type SectorRoleAssignmentSectorCard = {
  smEpf: SectorRoleAssignmentSmEpf;
  /** Display label (SM name or EPF). */
  smLabel: string;
  regionLabel: string;
  assignments: SectorRoleAssignmentsByRole;
};

export type SectorRoleAssignmentBoard = {
  sectors: SectorRoleAssignmentSectorCard[];
  candidatesByRole: Record<
    SectorAssignmentRoleCode,
    SectorRoleAssignmentCandidate[]
  >;
  sessionRole: string | null;
  canAssign: boolean;
};

/** Alias — same canonical SM key rules as OM assignments. */
export function normalizeSectorRoleAssignmentSmEpf(smEpf: string): string | null {
  return normalizeSectorOmAssignmentSmEpf(smEpf);
}

export function normalizeSectorRoleCode(
  roleCode: string | null | undefined,
): SectorAssignmentRoleCode | null {
  const normalized = normalizePortalRole(roleCode);
  if (!normalized) return null;
  if (!(SECTOR_ASSIGNMENT_ROLE_CODES as readonly string[]).includes(normalized)) {
    return null;
  }
  return normalized as SectorAssignmentRoleCode;
}

export function isSectorRoleAssignmentRoleCode(
  roleCode: string | null | undefined,
): roleCode is SectorAssignmentRoleCode {
  return normalizeSectorRoleCode(roleCode) !== null;
}

/** MD/OD only — sector board pickers and legacy SectorTile OM assign. */
export function canManageSectorRoleAssignments(
  sessionRole: string | null | undefined,
): boolean {
  return isExecutiveRank(sessionRole);
}

/** Assignee must hold the matching MNR rank for the sector role slot. */
export function employeeRankMatchesSectorRole(
  employeeRank: string | null | undefined,
  roleCode: SectorAssignmentRoleCode,
): boolean {
  return normalizePortalRole(employeeRank) === roleCode;
}

export function formatSectorRoleCandidateLabel(
  fullName: string,
  epfNo: string | null | undefined,
): string {
  return formatOmCandidateLabel(fullName, epfNo);
}

export function mapSectorRoleCandidates(
  staff: ReadonlyArray<{
    id: string;
    fullName: string;
    epfNo?: string | null;
    epf_no?: unknown;
    epf_num?: unknown;
    emp_number?: unknown;
    email: string | null;
    rank: string | null;
  }>,
  roleCode: SectorAssignmentRoleCode,
): SectorRoleAssignmentCandidate[] {
  return staff
    .filter((person) => employeeRankMatchesSectorRole(person.rank, roleCode))
    .map((person) => ({
      employeeId: person.id,
      fullName: person.fullName,
      epfNo: resolveEmployeeEpfNo(person),
      email: person.email,
      rank: roleCode,
    }));
}

export function mapAllSectorRoleCandidates(
  staff: ReadonlyArray<{
    id: string;
    fullName: string;
    epfNo?: string | null;
    epf_no?: unknown;
    epf_num?: unknown;
    emp_number?: unknown;
    email: string | null;
    rank: string | null;
  }>,
): Record<SectorAssignmentRoleCode, SectorRoleAssignmentCandidate[]> {
  return Object.fromEntries(
    SECTOR_ASSIGNMENT_ROLE_CODES.map((roleCode) => [
      roleCode,
      mapSectorRoleCandidates(staff, roleCode),
    ]),
  ) as Record<SectorAssignmentRoleCode, SectorRoleAssignmentCandidate[]>;
}

/** Build sm_epf → role_code → assignee map from flat assignment rows. */
export function indexSectorRoleAssignments(
  rows: ReadonlyArray<{
    sm_epf: string;
    role_code: string;
    employee_id: string;
    full_name?: string | null;
    epf_no?: string | null;
    epf_num?: string | null;
    emp_number?: string | null;
  }>,
): Record<string, SectorRoleAssignmentsByRole> {
  const bySmEpf: Record<string, SectorRoleAssignmentsByRole> = {};

  for (const row of rows) {
    const smEpf = normalizeSectorRoleAssignmentSmEpf(row.sm_epf);
    const roleCode = normalizeSectorRoleCode(row.role_code);
    if (!smEpf || !roleCode) continue;

    if (!bySmEpf[smEpf]) bySmEpf[smEpf] = {};
    bySmEpf[smEpf][roleCode] = {
      employeeId: row.employee_id,
      fullName:
        typeof row.full_name === 'string' && row.full_name.trim()
          ? row.full_name.trim()
          : 'Unnamed staff',
      epfNo: resolveEmployeeEpfNo(row),
      rank: roleCode,
    };
  }

  return bySmEpf;
}

/** Legacy sector_om_assignments row → sector_role_assignments insert shape. */
export function legacyOmAssignmentToRoleRow(row: {
  company_id: string;
  sm_epf: string;
  om_employee_id: string;
  assigned_by_employee_id?: string | null;
  assigned_at?: string;
}): Omit<SectorRoleAssignmentRow, 'id'> {
  return {
    company_id: row.company_id,
    sm_epf: row.sm_epf,
    role_code: 'OM',
    employee_id: row.om_employee_id,
    assigned_by_employee_id: row.assigned_by_employee_id ?? null,
    assigned_at: row.assigned_at ?? new Date().toISOString(),
  };
}

export const EMPTY_SECTOR_ROLE_CANDIDATES: Record<
  SectorAssignmentRoleCode,
  SectorRoleAssignmentCandidate[]
> = Object.fromEntries(
  SECTOR_ASSIGNMENT_ROLE_CODES.map((code) => [code, []]),
) as Record<SectorAssignmentRoleCode, SectorRoleAssignmentCandidate[]>;
