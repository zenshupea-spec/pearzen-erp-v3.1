import { normalizePeriodMonth } from '../app/executive/cafe/period-month';

export function cafeWorkDateFromCheckin(checkinDate: string): string {
  return checkinDate.slice(0, 10);
}

export function cafePeriodMonthFromWorkDate(workDate: string): string {
  return normalizePeriodMonth(workDate);
}

export function countCafeWorkedDays(logs: { worked: boolean }[]): number {
  return logs.filter((log) => log.worked).length;
}

export function sumCafeOtFromDayLogs(
  logs: Array<{ ot_hours?: number | null; ot_lkr?: number | null }>,
): { otTotalHours: number; otTotalLkr: number } {
  let otTotalHours = 0;
  let otTotalLkr = 0;

  for (const log of logs) {
    otTotalHours += Number(log.ot_hours) || 0;
    otTotalLkr += Number(log.ot_lkr) || 0;
  }

  return {
    otTotalHours: Math.round(otTotalHours * 100) / 100,
    otTotalLkr: Math.round(otTotalLkr),
  };
}

export function buildApprovedCafeDayLogRow(input: {
  companyId: string;
  employeeId: string;
  workDate: string;
  existingOtHours?: number | null;
  existingOtLkr?: number | null;
  updatedAt?: string;
}) {
  return {
    company_id: input.companyId,
    employee_id: input.employeeId,
    work_date: input.workDate,
    worked: true,
    ot_hours: Number(input.existingOtHours) || 0,
    ot_lkr: Number(input.existingOtLkr) || 0,
    updated_at: input.updatedAt ?? new Date().toISOString(),
  };
}

export function buildCafeStaffPeriodUpsert(input: {
  companyId: string;
  employeeId: string;
  periodMonth: string;
  daysWorked: number;
  dailyRateLkr: number;
  deductionsMtdLkr?: number;
  otTotalHours?: number;
  otTotalLkr?: number;
  roleLabel?: string | null;
}) {
  return {
    company_id: input.companyId,
    employee_id: input.employeeId,
    period_month: normalizePeriodMonth(input.periodMonth),
    daily_rate_lkr: input.dailyRateLkr,
    days_worked: input.daysWorked,
    deductions_mtd_lkr: Number(input.deductionsMtdLkr) || 0,
    ot_total_hours: Number(input.otTotalHours) || 0,
    ot_total_lkr: Number(input.otTotalLkr) || 0,
    role_label: input.roleLabel || 'Café Staff',
  };
}
