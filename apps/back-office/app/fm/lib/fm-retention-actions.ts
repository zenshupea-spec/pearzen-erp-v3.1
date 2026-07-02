'use server';

import { unstable_noStore as noStore } from 'next/cache';

import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  calculateSalaryRelease,
  type RetentionThresholds,
  type SalaryReleaseAction,
} from '../../../lib/salary-retention';
import { CVS_GUARD_OPS_ENABLED } from '../../../lib/cvs-workforce-phase';
import { getRankPayMatrix } from '../../executive/settings/rank-matrix-actions';
import { getMdEngineConstants } from '../../executive/settings/engine-constants-actions';
import {
  fetchMonthlySiteShiftRollup,
  type GuardEmpRow,
} from '../../hq/deductions/lib/monthly-site-shifts';
import { payrollMonthFromFmPeriod } from '../../../lib/deduction-month-lock-storage';
import { getFmPortfolio } from '../portfolio-actions';
import { requireFmPortfolioRead } from './fm-portfolio-auth-server';
import {
  FM_LIVE_PAYROLL_PERIOD,
  formatPayrollPeriodLabel,
  prevPayrollMonth,
  type PayrollPeriod,
} from './payroll-period';
import { inferCorporatePayrollGroup } from './payroll-earnings-display';
import type { RetentionGuardRow } from './retention-lists';

export type FmRetentionListsPayload = {
  periodLabel: string;
  prevMonthLabel: string;
  payrollPeriod: PayrollPeriod;
  thresholds: RetentionThresholds;
  stopList: RetentionGuardRow[];
  holdList: RetentionGuardRow[];
  guardOpsEnabled: boolean;
  error?: string;
};

async function fetchGuardShiftTotalsByEmployeeId(
  companyId: string,
  guards: GuardEmpRow[],
  payrollPeriod: PayrollPeriod,
): Promise<Map<string, number>> {
  const db = createSupabaseServiceClient();
  const payrollMonth = payrollMonthFromFmPeriod(payrollPeriod);
  const rollup = await fetchMonthlySiteShiftRollup(db, guards, `${payrollMonth}-01`, companyId);

  const totals = new Map<string, number>();
  for (const byEmployee of rollup.shiftCountBySite.values()) {
    for (const [employeeId, count] of byEmployee) {
      totals.set(employeeId, (totals.get(employeeId) ?? 0) + count);
    }
  }

  const { data: adjustments } = await db
    .from('fm_shift_adjustments')
    .select('employee_id, delta_shifts')
    .eq('company_id', companyId)
    .eq('payroll_month', payrollMonth);

  for (const row of adjustments ?? []) {
    const employeeId = String(row.employee_id);
    totals.set(employeeId, (totals.get(employeeId) ?? 0) + Number(row.delta_shifts ?? 0));
  }

  return totals;
}

function aggregateGuardPayrollFromPortfolio(
  portfolio: Awaited<ReturnType<typeof getFmPortfolio>>,
): Map<
  string,
  { empNo: string; name: string; shiftsHere: number; totalGross: number; totalDeductions: number; netTakeHome: number }
> {
  const map = new Map<
    string,
    {
      empNo: string;
      name: string;
      shiftsHere: number;
      totalGross: number;
      totalDeductions: number;
      netTakeHome: number;
    }
  >();

  for (const site of [...portfolio.pinnedSites, ...portfolio.sites]) {
    for (const emp of site.employees) {
      if (emp.corporateGroup !== 'GUARD_FIELD') continue;
      const existing = map.get(emp.id);
      if (!existing) {
        map.set(emp.id, {
          empNo: emp.empNumber,
          name: emp.name,
          shiftsHere: emp.shiftsAtSite,
          totalGross: emp.totalGross,
          totalDeductions: emp.totalDeductions,
          netTakeHome: emp.netTakeHome,
        });
        continue;
      }
      existing.shiftsHere += emp.shiftsAtSite;
      existing.totalGross += emp.totalGross;
      existing.totalDeductions += emp.totalDeductions;
      existing.netTakeHome += emp.netTakeHome;
    }
  }

  return map;
}

function buildRetentionRow(
  employeeId: string,
  empNo: string,
  name: string,
  prevShifts: number,
  currShifts: number,
  payroll:
    | {
        shiftsHere: number;
        totalGross: number;
        totalDeductions: number;
        netTakeHome: number;
      }
    | undefined,
): RetentionGuardRow {
  return {
    employeeId,
    empNo,
    name,
    prevShifts,
    shiftsHere: payroll?.shiftsHere ?? currShifts,
    totalGross: payroll?.totalGross ?? 0,
    totalDeductions: payroll?.totalDeductions ?? 0,
    netTakeHome: payroll?.netTakeHome ?? 0,
  };
}

export async function getFmRetentionLists(
  payrollPeriod: PayrollPeriod = FM_LIVE_PAYROLL_PERIOD,
): Promise<FmRetentionListsPayload> {
  noStore();

  const prevMonth = prevPayrollMonth(payrollPeriod);
  const periodLabel = formatPayrollPeriodLabel(payrollPeriod, 'long');
  const prevMonthLabel = formatPayrollPeriodLabel(prevMonth, 'long');

  const base: FmRetentionListsPayload = {
    periodLabel,
    prevMonthLabel,
    payrollPeriod,
    thresholds: {
      prevMonthMinShifts: 30,
      salaryMonthMinShifts: 10,
    },
    stopList: [],
    holdList: [],
    guardOpsEnabled: CVS_GUARD_OPS_ENABLED,
  };

  if (!CVS_GUARD_OPS_ENABLED) {
    return base;
  }

  let companyId: string;
  try {
    ({ companyId } = await requireFmPortfolioRead());
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : 'Forbidden',
    };
  }

  const [engine, rankMatrix, portfolio] = await Promise.all([
    getMdEngineConstants(),
    getRankPayMatrix(),
    getFmPortfolio(payrollPeriod),
  ]);

  const thresholds: RetentionThresholds = {
    prevMonthMinShifts: engine.prevMonthRetentionThreshold,
    salaryMonthMinShifts: engine.salaryMonthRetentionThreshold,
  };

  if (portfolio.error) {
    return { ...base, thresholds, error: portfolio.error };
  }

  const db = createSupabaseServiceClient();
  const { data: guardData, error: guardError } = await db
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, rank, group, status')
    .eq('company_id', companyId)
    .ilike('status', 'active')
    .order('full_name', { ascending: true });

  if (guardError) {
    return { ...base, thresholds, error: guardError.message };
  }

  const guards = (guardData ?? []).filter(
    (row) =>
      inferCorporatePayrollGroup({
        group: row.group,
        rank: row.rank,
        rankMatrix,
      }) === 'GUARD_FIELD',
  ) as GuardEmpRow[];

  const [prevShiftTotals, currShiftTotals] = await Promise.all([
    fetchGuardShiftTotalsByEmployeeId(companyId, guards, prevMonth),
    fetchGuardShiftTotalsByEmployeeId(companyId, guards, payrollPeriod),
  ]);

  const payrollByEmployee = aggregateGuardPayrollFromPortfolio(portfolio);
  const stopList: RetentionGuardRow[] = [];
  const holdList: RetentionGuardRow[] = [];

  for (const guard of guards) {
    const employeeId = String(guard.id);
    const empNo =
      String(guard.emp_number ?? '').trim() ||
      String(guard.epf_no ?? '').trim() ||
      String(guard.epf_num ?? '').trim() ||
      employeeId;
    const name = String(guard.full_name ?? empNo).trim() || empNo;
    const prevShifts = prevShiftTotals.get(employeeId) ?? 0;
    const currShifts = currShiftTotals.get(employeeId) ?? 0;
    const release = calculateSalaryRelease(
      prevShifts,
      currShifts,
      thresholds.prevMonthMinShifts,
      thresholds.salaryMonthMinShifts,
    ) satisfies SalaryReleaseAction;

    const payroll = payrollByEmployee.get(employeeId);
    const row = buildRetentionRow(employeeId, empNo, name, prevShifts, currShifts, payroll);

    if (release === 'STOP_PAYMENT') stopList.push(row);
    else if (release === 'HALF_SALARY') holdList.push(row);
  }

  stopList.sort((a, b) => a.prevShifts - b.prevShifts || a.name.localeCompare(b.name));
  holdList.sort((a, b) => a.shiftsHere - b.shiftsHere || a.name.localeCompare(b.name));

  return {
    ...base,
    thresholds,
    stopList,
    holdList,
  };
}

export async function getFmRetentionEmpNumberSets(
  payrollPeriod: PayrollPeriod = FM_LIVE_PAYROLL_PERIOD,
): Promise<{ stop: Set<string>; hold: Set<string> }> {
  const payload = await getFmRetentionLists(payrollPeriod);
  return {
    stop: new Set(payload.stopList.map((row) => row.empNo)),
    hold: new Set(payload.holdList.map((row) => row.empNo)),
  };
}
