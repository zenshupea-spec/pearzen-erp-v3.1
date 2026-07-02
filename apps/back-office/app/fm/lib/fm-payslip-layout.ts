import {
  computeEmployeePayrollStatutory,
  DEFAULT_APIT_SLABS,
  DEFAULT_STAMP_DUTY_LKR,
  DEFAULT_STAMP_DUTY_THRESHOLD_LKR,
  type PayrollStatutoryRates,
} from '../../../../../packages/payroll-deductions';
import type { PayrollPeriod } from './payroll-period';
import { formatPayrollPeriodLabel } from './payroll-period';
import type { FmPayrollRosterRow, FmShiftTypeLine } from './fm-payroll-roster-data';
import type { SmPayMode } from './sm-pay-settings';

export type PayslipEmployeeKind = 'ho_fixed' | 'sm' | 'cafe' | 'guard';

export type MonthCalendarShiftCounts = {
  weekdays: number;
  saturdays: number;
  sundays: number;
};

const DEFAULT_STATUTORY_RATES: PayrollStatutoryRates = {
  epfEmployeeRate: 8,
  epfEmployerRate: 12,
  etfRate: 3,
  apitSlabs: DEFAULT_APIT_SLABS,
  stampDutyLkr: DEFAULT_STAMP_DUTY_LKR,
  stampDutyThresholdLkr: DEFAULT_STAMP_DUTY_THRESHOLD_LKR,
};

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function parsePayrollPeriodFromLabel(periodLabel: string): PayrollPeriod | null {
  const match = periodLabel.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;
  const month = MONTH_NAME_TO_INDEX[match[1].toLowerCase()];
  const year = Number(match[2]);
  if (!month || !Number.isFinite(year)) return null;
  return { year, month };
}

/** Weekday (Mon–Fri), Saturday, and Sunday counts for a calendar month. */
export function countCalendarDaysForMonth(year: number, month: number): MonthCalendarShiftCounts {
  const daysInMonth = new Date(year, month, 0).getDate();
  let weekdays = 0;
  let saturdays = 0;
  let sundays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dow = new Date(year, month - 1, day).getDay();
    if (dow === 0) sundays += 1;
    else if (dow === 6) saturdays += 1;
    else weekdays += 1;
  }

  return { weekdays, saturdays, sundays };
}

export function inferPayslipEmployeeKind(row: FmPayrollRosterRow): PayslipEmployeeKind {
  if (row.payslipKind) return row.payslipKind;
  if (row.workforceGroup === 'cvs_sm' || row.payrollGroup === 'sm' || row.payrollGroup === 'sm_no_bank') {
    return 'sm';
  }
  if (row.workforceGroup === 'cvs' || row.payrollGroup === 'ho' || row.payrollGroup === 'ho_no_bank') {
    return 'ho_fixed';
  }
  if (row.workforceGroup === 'cafe') return 'cafe';
  return 'guard';
}

export function fixedSalaryCalendarShiftLines(
  periodLabel: string,
): FmShiftTypeLine[] {
  const period = parsePayrollPeriodFromLabel(periodLabel);
  const counts = period
    ? countCalendarDaysForMonth(period.year, period.month)
    : { weekdays: 0, saturdays: 0, sundays: 0 };

  return [
    { label: 'Basic shift pay', shifts: counts.weekdays, amountLkr: 0 },
    { label: 'Saturday', shifts: counts.saturdays, amountLkr: 0 },
    { label: 'Sunday', shifts: counts.sundays, amountLkr: 0 },
    { label: 'Poyaday', shifts: 0, amountLkr: 0 },
    { label: 'Public Holiday', shifts: 0, amountLkr: 0 },
  ];
}

export function resolvePayslipStatutory(row: FmPayrollRosterRow) {
  const gross = Math.max(0, row.earningsLkr);
  const computed = computeEmployeePayrollStatutory(gross, DEFAULT_STATUTORY_RATES);

  return {
    payeeTaxLkr: row.payeeTaxLkr ?? computed.apit,
    stampDutyLkr: row.stampDutyLkr ?? computed.stampDuty,
    epfEmployeeLkr: row.epfEmployeeLkr ?? computed.epfEmployee,
    epfEmployerLkr: row.epfEmployerLkr ?? computed.epfEmployer,
    etfEmployerLkr: row.etfEmployerLkr ?? computed.etfEmployer,
  };
}

export type SmPayslipEarningsSplit = {
  basicSalaryLkr: number;
  siteAllowanceLkr: number;
  totalEarningsLkr: number;
};

export type GuardPayslipEarningsSplit = {
  shiftTypeLines: FmShiftTypeLine[];
  basicShiftPaidTotalLkr: number;
  siteAllowanceLkr: number;
  totalShifts: number;
  daysWorked: number;
};

/** Guard payslip: formula shift-box totals plus site-rate excess as Site Allowance. */
export function resolveGuardPayslipEarnings(row: FmPayrollRosterRow): GuardPayslipEarningsSplit {
  const shiftTypeLines = row.shiftTypeLines ?? [];
  const basicShiftPaidTotalLkr =
    row.guardFormulaGrossLkr ??
    row.basicShiftPaidLkr ??
    shiftTypeLines.reduce((sum, line) => sum + line.amountLkr, 0);
  const siteAllowanceLkr =
    row.siteAllowanceLkr ??
    Math.max(0, (row.guardSiteRateGrossLkr ?? 0) - basicShiftPaidTotalLkr);
  const totalShifts =
    row.totalShifts ?? shiftTypeLines.reduce((sum, line) => sum + line.shifts, 0);
  const daysWorked = row.daysWorked ?? totalShifts;

  return {
    shiftTypeLines,
    basicShiftPaidTotalLkr,
    siteAllowanceLkr,
    totalShifts,
    daysWorked,
  };
}

/** Split SM gross into basic + site allowance per MD pay mode (for payslip display). */
export function resolveSmPayslipEarnings(
  row: FmPayrollRosterRow,
  mode: SmPayMode,
): SmPayslipEarningsSplit {
  const visitPayLkr = Math.max(0, row.smVisitPayLkr ?? 0);
  const fixedBasicLkr = Math.max(0, row.smFixedBasicLkr ?? row.salaryLkr ?? 0);
  const gross = Math.max(0, row.earningsLkr);

  if (mode === 'FIXED_AND_PER_VISIT') {
    return {
      basicSalaryLkr: fixedBasicLkr,
      siteAllowanceLkr: visitPayLkr,
      totalEarningsLkr: fixedBasicLkr + visitPayLkr,
    };
  }

  if (mode === 'PER_VISIT_ONLY') {
    const basicSalaryLkr = fixedBasicLkr;
    const siteAllowanceLkr = visitPayLkr - basicSalaryLkr;
    return {
      basicSalaryLkr,
      siteAllowanceLkr,
      totalEarningsLkr: gross > 0 ? gross : basicSalaryLkr + siteAllowanceLkr,
    };
  }

  return {
    basicSalaryLkr: fixedBasicLkr,
    siteAllowanceLkr: 0,
    totalEarningsLkr: fixedBasicLkr,
  };
}

export function payslipPeriodTitle(periodLabel: string): string {
  const period = parsePayrollPeriodFromLabel(periodLabel);
  if (!period) return `PAY SLIP ${periodLabel.toUpperCase()}`;
  const monthToken = formatPayrollPeriodLabel(period, 'short').split(' ')[0]?.toUpperCase() ?? '';
  return `PAY SLIP ${monthToken} - ${period.year}`;
}
