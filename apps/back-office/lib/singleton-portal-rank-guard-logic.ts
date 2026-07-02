import {
  isSingletonHrAssignablePortalRank,
  SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS,
} from '../../../packages/rank-pay-matrix';

const TERMINATED_STATUSES = new Set(['RESIGNED', 'TERMINATED']);

export function isActiveWorkforceStatus(status: unknown): boolean {
  const normalized = String(status ?? 'ACTIVE').trim().toUpperCase();
  return normalized.length > 0 && !TERMINATED_STATUSES.has(normalized);
}

export type SingletonPortalRankOccupant = {
  rankCode: string;
  employeeId: string;
  fullName: string;
  workEmail: string;
};

type EmployeeOccupancyRow = {
  id: string;
  rank: string;
  full_name: string;
  status: string | null;
};

type PortalAuthOccupancyRow = {
  work_email: string;
  is_active: boolean;
};

/** Pure occupancy resolver — used by server fetch and unit tests. */
export function occupiedSingletonRanksFromRecords(
  employees: EmployeeOccupancyRow[],
  authByEmployeeId: Map<string, PortalAuthOccupancyRow>,
  excludeEmployeeId?: string | null,
): SingletonPortalRankOccupant[] {
  const occupants: SingletonPortalRankOccupant[] = [];
  const seenRanks = new Set<string>();

  for (const employee of employees) {
    if (excludeEmployeeId && employee.id === excludeEmployeeId) continue;
    if (!isActiveWorkforceStatus(employee.status)) continue;

    const rankCode = employee.rank.trim().toUpperCase();
    if (!isSingletonHrAssignablePortalRank(rankCode)) continue;
    if (seenRanks.has(rankCode)) continue;

    const auth = authByEmployeeId.get(employee.id);
    if (!auth?.is_active) continue;
    const workEmail = auth.work_email?.trim() ?? '';
    if (!workEmail) continue;

    seenRanks.add(rankCode);
    occupants.push({
      rankCode,
      employeeId: employee.id,
      fullName: employee.full_name?.trim() || 'Unnamed',
      workEmail,
    });
  }

  return occupants;
}

export function formatSingletonPortalRankOccupiedMessage(
  occupant: SingletonPortalRankOccupant,
): string {
  return `${occupant.rankCode} is already assigned to ${occupant.fullName} (${occupant.workEmail}).`;
}

export { SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS };
