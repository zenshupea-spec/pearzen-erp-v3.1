/**
 * Locked spec for MD Portal → Sector Manager → OM assignment.
 * Step file: CVS_MD_SECTOR_OM_ASSIGNMENT_STEPS.txt (Step 01).
 *
 * ASSIGNMENT KEY (not geographic sector name)
 * -------------------------------------------
 * Each SectorTile card = one Sector Manager portfolio from `getLiveFieldRadar`.
 * Persist and join on `sm_epf` = the SM **canonical key**:
 *   `sectorManagerEpfKey(employee)` → emp_number (uppercase) else epf_no else epf_num.
 * This matches `FieldRadarManager.canonicalKey` and `LiveFieldSector.id` in field-radar.ts.
 *
 * Do NOT use:
 *   · `employees.site` on the SM (geographic label only, e.g. "COLOMBO 1")
 *   · café `guard_sector_assignments.sector_id` (unrelated UUID)
 *   · raw `site_profiles.assigned_sm_epf` without normalizing to canonical key
 *
 * ALIAS RESOLUTION (scope + joins)
 * ----------------------------------
 * When matching sites/guards/incidents, expand `sm_epf` with `collectSmEpfAliasKeys(smRow)`
 * so legacy epf_no / emp_number variants still resolve (same as field-radar `smLookupKeys`).
 *
 * CARDINALITY
 * -----------
 * · At most **one OM per SM portfolio**: UNIQUE (company_id, sm_epf).
 * · One OM **may** hold multiple portfolios: multiple rows with same om_employee_id.
 * · `__unassigned__` site bucket has no SM — no OM assignment row (dropdown hidden).
 *
 * OM VISIBILITY (server-enforced, Step 06+)
 * -----------------------------------------
 * OM session with assignments sees only:
 *   · assigned SM(s) and their alias keys
 *   · sites where `site_profiles.assigned_sm_epf` matches those keys
 *   · guards linked via `sm_guard_assignments` and/or `employees.site` on those sites
 * MD/OD: no filter. Unassigned OM (zero rows): empty field data (fail closed).
 */

import { isExecutiveRank } from './portal-role-utils';

/** Canonical SM key stored in `sector_om_assignments.sm_epf`. */
export type SectorOmAssignmentSmEpf = string;

export type SectorOmAssignmentRow = {
  id: string;
  company_id: string;
  /** Canonical SM key — `sectorManagerEpfKey` / field-radar `canonicalKey`. */
  sm_epf: SectorOmAssignmentSmEpf;
  om_employee_id: string;
  assigned_by_employee_id: string | null;
  assigned_at: string;
};

export type SectorOmAssignmentBoardOmCandidate = {
  employeeId: string;
  fullName: string;
  epfNo: string | null;
  email: string | null;
  rank: string;
};

export type SectorOmAssignedOm = {
  employeeId: string;
  fullName: string;
  epfNo: string | null;
} | null;

/** Per-sector assignment surfaced on SectorTile (field-radar extension, Step 04). */
export type SectorOmAssignmentView = {
  smEpf: SectorOmAssignmentSmEpf;
  assignedOm: SectorOmAssignedOm;
};

export const SECTOR_OM_ASSIGNMENTS_TABLE = 'sector_om_assignments' as const;

export type SectorOmAssignmentBoard = {
  omCandidates: SectorOmAssignmentBoardOmCandidate[];
  /** Canonical `sm_epf` → assigned OM (null key omitted). */
  assignmentsBySmEpf: Record<string, NonNullable<SectorOmAssignedOm>>;
  sessionRole: string | null;
  canAssign: boolean;
};

/** Reject blank, unassigned bucket, and non-canonical SM keys. */
export function normalizeSectorOmAssignmentSmEpf(smEpf: string): string | null {
  const key = String(smEpf ?? '')
    .trim()
    .toUpperCase();
  if (!key || key === '__UNASSIGNED__') return null;
  return key;
}

export function isOmRankEmployee(rank: string | null | undefined): boolean {
  return (rank ?? '').trim().toUpperCase() === 'OM';
}

/** MD/OD only — OM, FM, HR, and other ranks must not assign sector OMs. */
export function canManageSectorOmAssignments(sessionRole: string | null | undefined): boolean {
  return isExecutiveRank(sessionRole);
}

/** Canonical EPF display — emp_number → epf_no → epf_num (matches MNR desk). */
export function resolveEmployeeEpfNo(row: {
  epfNo?: string | null;
  epf_no?: unknown;
  epf_num?: unknown;
  emp_number?: unknown;
}): string | null {
  for (const field of [row.epfNo, row.epf_no, row.epf_num, row.emp_number]) {
    const value = String(field ?? '').trim();
    if (value) return value;
  }
  return null;
}

export function formatOmCandidateLabel(
  fullName: string,
  epfNo: string | null | undefined,
): string {
  const name = fullName.trim() || 'Unnamed staff';
  const epf = String(epfNo ?? '').trim();
  return epf ? `${epf} · ${name}` : name;
}

export function mapOmRankCandidates(
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
): SectorOmAssignmentBoardOmCandidate[] {
  return staff
    .filter((person) => isOmRankEmployee(person.rank))
    .map((person) => ({
      employeeId: person.id,
      fullName: person.fullName,
      epfNo: resolveEmployeeEpfNo(person),
      email: person.email,
      rank: 'OM',
    }));
}
