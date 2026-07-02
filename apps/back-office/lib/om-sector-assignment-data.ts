import 'server-only';

import {
  fetchSectorRoleAssignmentsForCompany,
} from './sector-role-assignment-data';
import type { SectorOmAssignedOm } from './om-sector-assignment-spec';

/** Company-scoped OM assignment map (reads sector_role_assignments, role_code = OM). */
export async function fetchSectorOmAssignmentsForCompany(
  companyId: string,
): Promise<Record<string, NonNullable<SectorOmAssignedOm>>> {
  const assignmentsBySmEpf = await fetchSectorRoleAssignmentsForCompany(companyId);
  const omBySmEpf: Record<string, NonNullable<SectorOmAssignedOm>> = {};

  for (const [smEpf, roles] of Object.entries(assignmentsBySmEpf)) {
    const om = roles.OM;
    if (!om) continue;
    omBySmEpf[smEpf] = {
      employeeId: om.employeeId,
      fullName: om.fullName,
      epfNo: om.epfNo,
    };
  }

  return omBySmEpf;
}
