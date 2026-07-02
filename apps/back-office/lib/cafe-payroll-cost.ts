export type CafePayrollEmployeeInput = {
  id: string;
  full_name?: string | null;
  rank?: string | null;
  base_salary?: number | null;
};

export type CafePayrollPeriodRow = {
  employee_id: string;
  daily_rate_lkr: number;
  days_worked: number;
  deductions_mtd_lkr: number;
  role_label: string;
  ot_total_hours?: number | null;
  ot_total_lkr?: number | null;
};

export type CafePayrollDayLogRow = {
  worked: boolean;
  ot_lkr: number;
  ot_hours?: number;
};

export type CafePayrollMember = {
  id: string;
  name: string;
  role: string;
  dailyRate: number;
  daysWorked: number;
  deductionsMTD: number;
  otTotalLkr: number;
  otTotalHours: number;
  monthlyBasic: number;
};

export function calcCafeMemberGrossLkr(
  member: Pick<CafePayrollMember, 'dailyRate' | 'daysWorked' | 'otTotalLkr'>,
): number {
  return Math.round(member.dailyRate * member.daysWorked + member.otTotalLkr);
}

export function calcCafePayrollCostLkr(
  members: Array<Pick<CafePayrollMember, 'dailyRate' | 'daysWorked' | 'otTotalLkr'>>,
): number {
  return members.reduce((sum, member) => sum + calcCafeMemberGrossLkr(member), 0);
}

/** Merge period + day-log accrual into one payroll line (R-CAF-04). */
export function mergeCafePayrollMember(input: {
  employee: CafePayrollEmployeeInput;
  period?: CafePayrollPeriodRow | null;
  dayLogs?: CafePayrollDayLogRow[];
}): CafePayrollMember {
  const basic = Number(input.employee.base_salary) || 45_000;
  const period = input.period;
  const logs = input.dayLogs ?? [];

  const dailyRate = period
    ? Number(period.daily_rate_lkr) || Math.round(basic / 26)
    : Math.round(basic / 26);

  const daysFromLogs = logs.filter((log) => log.worked).length;
  const daysWorked = logs.length > 0 ? daysFromLogs : Number(period?.days_worked ?? 0);
  const otFromLogs = logs.reduce(
    (acc, log) => ({
      otTotalLkr: acc.otTotalLkr + (Number(log.ot_lkr) || 0),
      otTotalHours: acc.otTotalHours + (Number(log.ot_hours) || 0),
    }),
    { otTotalLkr: 0, otTotalHours: 0 },
  );
  const otTotalLkr =
    logs.length > 0 ? Math.round(otFromLogs.otTotalLkr) : Number(period?.ot_total_lkr) || 0;
  const otTotalHours =
    logs.length > 0
      ? Math.round(otFromLogs.otTotalHours * 100) / 100
      : Number(period?.ot_total_hours) || 0;

  return {
    id: String(input.employee.id),
    name: String(input.employee.full_name ?? ''),
    role: period?.role_label || input.employee.rank || 'Café Staff',
    dailyRate,
    daysWorked,
    deductionsMTD: Number(period?.deductions_mtd_lkr) || 0,
    otTotalLkr,
    otTotalHours,
    monthlyBasic: basic,
  };
}

export function cafePayrollMemberToStaffMember(
  member: CafePayrollMember,
): Pick<CafePayrollMember, 'id' | 'name' | 'role' | 'dailyRate' | 'daysWorked' | 'deductionsMTD' | 'otTotalLkr'> {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    dailyRate: member.dailyRate,
    daysWorked: member.daysWorked,
    deductionsMTD: member.deductionsMTD,
    otTotalLkr: member.otTotalLkr,
  };
}
