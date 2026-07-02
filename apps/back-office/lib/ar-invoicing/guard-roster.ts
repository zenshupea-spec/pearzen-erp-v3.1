import type { ArRankKey } from '../guard-site-pay';

export type ArGuardRosterEntry = {
  empNo: string;
  name: string;
  rank: ArRankKey;
  /** Confirmed shift count from monthly rollup for this billing month. */
  shiftsWorked?: number;
  /** Invoice rate applied for this guard's billed rank. */
  billedRate?: number;
};

export type ArGuardRostersByClientMonth = Record<string, Record<string, ArGuardRosterEntry[]>>;

export type ArEmployeeShiftRow = {
  employeeId: string;
  rank: ArRankKey;
  rate: number;
  shifts: number;
  isEventBill?: boolean;
  eventLabel?: string;
};

type EmployeeRow = {
  id: string;
  emp_number: string | null;
  full_name: string | null;
};

export function buildGuardRosterFromEmployeeShifts(
  employeeShifts: ArEmployeeShiftRow[],
  empById: Map<string, EmployeeRow>,
): ArGuardRosterEntry[] {
  const byGuardRate = new Map<string, ArGuardRosterEntry>();

  for (const row of employeeShifts) {
    const emp = empById.get(row.employeeId);
    if (!emp || row.shifts <= 0) continue;
    const empNo = emp.emp_number ?? emp.id.slice(0, 8);
    const key = `${row.employeeId}:${row.rank}:${row.rate}`;
    const existing = byGuardRate.get(key);
    if (existing) {
      existing.shiftsWorked = (existing.shiftsWorked ?? 0) + row.shifts;
      continue;
    }
    byGuardRate.set(key, {
      empNo,
      name: emp.full_name?.trim() || 'Guard',
      rank: row.rank,
      shiftsWorked: row.shifts,
      billedRate: row.rate,
    });
  }

  return [...byGuardRate.values()].sort((a, b) => a.empNo.localeCompare(b.empNo));
}

export function guardRosterForCell(
  rosters: ArGuardRostersByClientMonth,
  clientId: string,
  monthKey: string,
): ArGuardRosterEntry[] {
  return rosters[clientId]?.[monthKey] ?? [];
}
