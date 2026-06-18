'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context-server';
import {
  FM_SM_COMPENSATION,
  computeSmGrossLkr,
} from './lib/sm-pay-settings';
import { calculateStandardDay } from '../../lib/compensation-engine';
import { completedYearsOfService } from '../../../../packages/gratuity';
import {
  adjustedMonthlyBasicFromRank,
  type RankPayEntry,
} from '../../../../packages/rank-pay-matrix';
import { getRankPayMatrix } from '../executive/settings/rank-matrix-actions';
import {
  type CorporatePayrollGroup,
  EMPTY_VARIABLE_EARNINGS,
  fixedAllowancesFromEmployeeRow,
  hoFixedShellFromMnrBaseSalary,
  inferCorporatePayrollGroup,
  totalGrossFromPayParts,
  type FixedMonthlyAllowances,
  type GuardFieldEarnings,
  type VariablePayrollEarnings,
  variableEarningsFromRow,
} from './lib/payroll-earnings-display';
import {
  GUARD_COHORT_META,
  GUARD_COHORT_ORDER,
  GUARD_COHORT_SITE_IDS,
  PINNED_CAFE_SITE_ID,
  PINNED_HO_SITE_ID,
  PINNED_SM_SITE_ID,
  classifyGuardCohort,
  hasBankOnFile,
  STAFF_NO_BANK_META,
  STAFF_NO_BANK_SITE_IDS,
  staffNoBankCohortForKind,
  type GuardPayrollCohort,
  type StaffPayrollKind,
} from './lib/guard-payroll-cohorts';
import { ensurePinnedPayrollSites } from './lib/pinned-payroll-sites';
import { FM_LIVE_PAYROLL_PERIOD, type PayrollPeriod } from './lib/payroll-period';
import { payrollMonthFromFmPeriod } from '../../lib/deduction-month-lock-storage';
import {
  mergePortfolioDeductionsForEmployee,
  recalcEmployeeDeductionTotals,
  type FmEmployeeDeductionPlanRow,
  type FmPortfolioDeduction,
} from './lib/fm-employee-deduction-plans';
import {
  fetchActiveFmDeductionPlans,
  fetchApprovedSalaryAdvances,
  fetchHqMonthlyDeductions,
} from './lib/fm-deduction-plans-data';

export type { FmPortfolioDeduction };

export type FmPortfolioEmployeeSeed = {
  id: string;
  empNumber: string;
  name: string;
  rank: string;
  corporateGroup: CorporatePayrollGroup;
  shiftsAtSite: number;
  totalGross: number;
  totalDeductions: number;
  netTakeHome: number;
  deductions: FmPortfolioDeduction[];
  earnings: {
    crossSiteDistribution: { site: string; shifts: number }[];
    cafeData?: {
      monthlyBasicLkr: number;
      daysWorked: number;
      totalOT: number;
      basePayLkr: number;
      otPayLkr: number;
    };
    smPayData?: {
      payMode: typeof FM_SM_COMPENSATION.payMode;
      visitsCompleted: number;
      visitsTarget: number;
      perVisitRateLkr: number;
      visitPayLkr: number;
      fixedBasicLkr: number;
    };
    hoFixedData?: { mnrBaseSalaryLkr: number };
    guardData?: GuardFieldEarnings;
    basePayLkr?: number;
    fixedAllowances?: FixedMonthlyAllowances;
    variableEarnings?: VariablePayrollEarnings;
    dayTypeBreakdown: {
      type: 'Normal Days' | 'Poya Days' | 'Public Holidays' | 'Sundays' | 'Saturdays';
      totalShifts: number;
      rateMultiplier: string;
      lkrEarned: number;
      dates: { date: string; shift: string; premium: number }[];
    }[];
  };
};

export type FmPortfolioSiteSeed = {
  id: string;
  name: string;
  location: string;
  clientBilled: number;
  payrollCost: number;
  smCashAllocation?: number;
  payrollGroup?: 'cafe' | 'ho' | 'sm' | 'ho_no_bank' | 'sm_no_bank' | 'cafe_no_bank' | GuardPayrollCohort;
  displayEmployeeCount?: number;
  employees: FmPortfolioEmployeeSeed[];
};

export type FmPortfolioPayload = {
  pinnedSites: FmPortfolioSiteSeed[];
  sites: FmPortfolioSiteSeed[];
  shiftAdjustments: Record<
    string,
    { delta: number; audit: { at: string; detail: string; previousShifts: number; newShifts: number }[] }
  >;
  error?: string;
};

const EMPTY: FmPortfolioPayload = {
  pinnedSites: [],
  sites: [],
  shiftAdjustments: {},
};

type SiteRegistrationKind = 'client' | 'head_office' | 'cafe_branch';

type PortfolioEmployeeRow = Awaited<ReturnType<typeof fetchEmployees>>[number];

function employeeCorporateGroup(emp: PortfolioEmployeeRow): CorporatePayrollGroup {
  return inferCorporatePayrollGroup({ group: emp.group, rank: emp.rank });
}

function isEmployeeCorporateGroup(
  emp: PortfolioEmployeeRow,
  group: CorporatePayrollGroup,
): boolean {
  return employeeCorporateGroup(emp) === group;
}

function inferSiteKind(row: {
  client_name?: unknown;
  site_name?: unknown;
  site_type?: unknown;
}): SiteRegistrationKind {
  const clientName = String(row.client_name ?? '').trim();
  const siteName = String(row.site_name ?? '').trim();
  const siteType = String(row.site_type ?? '').trim().toUpperCase();

  if (
    clientName === 'Head Office' ||
    siteName === 'Head Office' ||
    siteType === 'OFFICE'
  ) {
    return 'head_office';
  }

  if (
    clientName.startsWith('Café') ||
    clientName.startsWith('Cafe') ||
    siteName.startsWith('Café') ||
    siteName.startsWith('Cafe')
  ) {
    return 'cafe_branch';
  }

  return 'client';
}

function employeeEpfKeys(emp: {
  emp_number?: unknown;
  epf_no?: unknown;
  epf_num?: unknown;
}): string[] {
  const keys = new Set<string>();
  for (const value of [emp.emp_number, emp.epf_no, emp.epf_num]) {
    const key = String(value ?? '').trim().toUpperCase();
    if (key) keys.add(key);
  }
  return [...keys];
}

function dedupeEmployees<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function matchEmployeesByEpfs<T extends { emp_number?: unknown; epf_no?: unknown; epf_num?: unknown }>(
  employees: T[],
  epfs: string[],
): T[] {
  const wanted = new Set(epfs.map((epf) => epf.trim().toUpperCase()).filter(Boolean));
  if (wanted.size === 0) return [];
  return employees.filter((emp) => employeeEpfKeys(emp).some((key) => wanted.has(key)));
}

function minimalDayTypes(normalShifts: number, normalLkr: number) {
  return [
    { type: 'Normal Days' as const, totalShifts: normalShifts, rateMultiplier: '1.0x', lkrEarned: normalLkr, dates: [] },
    { type: 'Sundays' as const, totalShifts: 0, rateMultiplier: '1.5x', lkrEarned: 0, dates: [] },
    { type: 'Poya Days' as const, totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
    { type: 'Public Holidays' as const, totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
    { type: 'Saturdays' as const, totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
  ];
}

function payrollPeriodEndIso(period: PayrollPeriod): string {
  const lastDay = new Date(period.year, period.month, 0).getDate();
  return `${period.year}-${String(period.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function guardPayFromEmployee(
  emp: PortfolioEmployeeRow,
  rankMatrix: RankPayEntry[],
  periodEndIso: string,
): GuardFieldEarnings {
  const rank = emp.rank != null ? String(emp.rank) : null;
  const years = completedYearsOfService(
    emp.date_joined != null ? String(emp.date_joined) : null,
    periodEndIso,
  );
  const recordedBasic =
    emp.base_salary != null && emp.base_salary !== ''
      ? Number(emp.base_salary)
      : null;
  const monthlyBasicLkr = adjustedMonthlyBasicFromRank(
    rankMatrix,
    rank,
    years,
    recordedBasic,
  );
  const standardDayGrossLkr = calculateStandardDay(monthlyBasicLkr).grossPay;
  return { monthlyBasicLkr, standardDayGrossLkr };
}

function guardGrossFromShifts(shifts: number, guardPay: GuardFieldEarnings): number {
  return Math.round(shifts * guardPay.standardDayGrossLkr);
}

async function resolveCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

async function fetchEmployees(companyId: string | null) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from('employees')
    .select(
      'id, emp_number, epf_no, epf_num, full_name, rank, site, group, status, base_salary, date_joined, bank_name, site_allowance_lkr, meal_allowance_lkr, transport_allowance_lkr',
    )
    .ilike('status', 'active')
    .order('full_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) {
    console.error('❌ SUPABASE ERROR (fetchEmployees):', error.message);
    return [];
  }
  return data ?? [];
}

async function fetchSites(companyId: string | null) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from('site_profiles')
    .select('id, site_name, client_name, address, rate_matrix, site_type, site_status')
    .order('site_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

async function fetchSiteStaffAssignments(companyId: string) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('site_staff_assignments')
    .select('site_profile_id, staff_epf')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

async function fetchShiftCounts(companyId: string, payrollMonth: string) {
  const [year, month] = payrollMonth.split('-').map(Number);
  const start = `${payrollMonth}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('time_shifts')
    .select('employee_id, site_id')
    .eq('company_id', companyId)
    .gte('shift_date', start)
    .lte('shift_date', end);
  if (error) return new Map<string, number>();
  const counts = new Map<string, number>();
  (data ?? []).forEach((row) => {
    const key = `${row.employee_id}:${row.site_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

async function fetchSmVisits(companyId: string, payrollMonth: string) {
  const [year, month] = payrollMonth.split('-').map(Number);
  const start = `${payrollMonth}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('sm_visit_logs')
    .select('sm_epf, visit_date')
    .eq('company_id', companyId)
    .gte('visit_date', start)
    .lte('visit_date', end);
  const counts = new Map<string, number>();
  (data ?? []).forEach((row) => {
    const epf = String(row.sm_epf ?? '');
    counts.set(epf, (counts.get(epf) ?? 0) + 1);
  });
  return counts;
}

async function fetchShiftAdjustments(companyId: string, payrollMonth: string) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('fm_shift_adjustments')
    .select('*')
    .eq('company_id', companyId)
    .eq('payroll_month', payrollMonth)
    .order('created_at', { ascending: true });
  return data ?? [];
}

async function fetchPayrollEarningsAdjustments(
  companyId: string,
  payrollPeriod: PayrollPeriod,
): Promise<Map<string, VariablePayrollEarnings>> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('fm_payroll_earnings_adjustments')
    .select('employee_id, arrears_lkr, performance_incentive_lkr')
    .eq('company_id', companyId)
    .eq('period_year', payrollPeriod.year)
    .eq('period_month', payrollPeriod.month);

  if (error) {
    if (!/does not exist|42P01/i.test(error.message)) {
      console.error('❌ SUPABASE ERROR (fetchPayrollEarningsAdjustments):', error.message);
    }
    return new Map();
  }

  const map = new Map<string, VariablePayrollEarnings>();
  (data ?? []).forEach((row) => {
    map.set(String(row.employee_id), variableEarningsFromRow(row));
  });
  return map;
}

function finalizeEmployeePay(
  seed: Omit<FmPortfolioEmployeeSeed, 'totalGross' | 'netTakeHome'>,
  emp: PortfolioEmployeeRow,
  basePayLkr: number,
  variableByEmployee: Map<string, VariablePayrollEarnings>,
): FmPortfolioEmployeeSeed {
  const fixedAllowances = fixedAllowancesFromEmployeeRow(emp);
  const variableEarnings = variableByEmployee.get(String(emp.id)) ?? EMPTY_VARIABLE_EARNINGS;
  const totalGross = totalGrossFromPayParts(basePayLkr, fixedAllowances, variableEarnings);
  return {
    ...seed,
    totalGross,
    netTakeHome: Math.max(0, totalGross - seed.totalDeductions),
    earnings: {
      ...seed.earnings,
      basePayLkr,
      fixedAllowances,
      variableEarnings,
    },
  };
}

function buildGuardEmployee(
  emp: PortfolioEmployeeRow,
  siteId: string,
  siteName: string,
  shiftCounts: Map<string, number>,
  variableByEmployee: Map<string, VariablePayrollEarnings>,
  rankMatrix: RankPayEntry[],
  periodEndIso: string,
): FmPortfolioEmployeeSeed {
  const shifts = shiftCounts.get(`${emp.id}:${siteId}`) ?? 0;
  const guardPay = guardPayFromEmployee(emp, rankMatrix, periodEndIso);
  const basePayLkr = guardGrossFromShifts(shifts, guardPay);
  return finalizeEmployeePay(
    {
      id: emp.id,
      empNumber: emp.emp_number ?? '',
      name: emp.full_name ?? '',
      rank: emp.rank ?? 'Guard',
      corporateGroup: 'GUARD_FIELD',
      shiftsAtSite: shifts,
      totalDeductions: 0,
      deductions: [],
      earnings: {
        crossSiteDistribution: [{ site: siteName, shifts }],
        guardData: guardPay,
        dayTypeBreakdown: minimalDayTypes(shifts, basePayLkr),
      },
    },
    emp,
    basePayLkr,
    variableByEmployee,
  );
}

function buildGuardEmployeeAggregate(
  emp: PortfolioEmployeeRow,
  sites: Awaited<ReturnType<typeof fetchSites>>,
  shiftCounts: Map<string, number>,
  variableByEmployee: Map<string, VariablePayrollEarnings>,
  rankMatrix: RankPayEntry[],
  periodEndIso: string,
): FmPortfolioEmployeeSeed {
  const crossSiteDistribution = sites
    .map((site) => ({
      site: site.site_name,
      shifts: shiftCounts.get(`${emp.id}:${site.id}`) ?? 0,
    }))
    .filter((entry) => entry.shifts > 0);

  if (crossSiteDistribution.length === 0) {
    const fallbackSite = (emp.site as string | null)?.trim() || 'Unassigned';
    crossSiteDistribution.push({ site: fallbackSite, shifts: 0 });
  }

  const totalShifts = crossSiteDistribution.reduce((sum, entry) => sum + entry.shifts, 0);
  const guardPay = guardPayFromEmployee(emp, rankMatrix, periodEndIso);
  const basePayLkr = guardGrossFromShifts(totalShifts, guardPay);

  return finalizeEmployeePay(
    {
      id: emp.id,
      empNumber: emp.emp_number ?? '',
      name: emp.full_name ?? '',
      rank: emp.rank ?? 'Guard',
      corporateGroup: 'GUARD_FIELD',
      shiftsAtSite: totalShifts,
      totalDeductions: 0,
      deductions: [],
      earnings: {
        crossSiteDistribution,
        guardData: guardPay,
        dayTypeBreakdown: minimalDayTypes(totalShifts, basePayLkr),
      },
    },
    emp,
    basePayLkr,
    variableByEmployee,
  );
}

function buildGuardCohortPinnedSites(
  guardEmployees: PortfolioEmployeeRow[],
  sites: Awaited<ReturnType<typeof fetchSites>>,
  shiftCounts: Map<string, number>,
  variableByEmployee: Map<string, VariablePayrollEarnings>,
  rankMatrix: RankPayEntry[],
  periodEndIso: string,
): FmPortfolioSiteSeed[] {
  const cohortEmployees = new Map<GuardPayrollCohort, FmPortfolioEmployeeSeed[]>();

  guardEmployees.forEach((emp) => {
    const cohort = classifyGuardCohort(emp.emp_number ?? '', emp.bank_name as string | null);
    const list = cohortEmployees.get(cohort) ?? [];
    list.push(
      buildGuardEmployeeAggregate(emp, sites, shiftCounts, variableByEmployee, rankMatrix, periodEndIso),
    );
    cohortEmployees.set(cohort, list);
  });

  return GUARD_COHORT_ORDER.map((cohort) => {
    const employees = cohortEmployees.get(cohort) ?? [];
    const meta = GUARD_COHORT_META[cohort];
    return {
      id: GUARD_COHORT_SITE_IDS[cohort],
      name: meta.name,
      location: meta.location,
      clientBilled: 0,
      payrollCost: sumPayrollCost(employees),
      payrollGroup: cohort,
      displayEmployeeCount: employees.length,
      employees,
    } satisfies FmPortfolioSiteSeed;
  });
}

function buildHoEmployee(
  emp: PortfolioEmployeeRow,
  variableByEmployee: Map<string, VariablePayrollEarnings>,
): FmPortfolioEmployeeSeed {
  const ho = hoFixedShellFromMnrBaseSalary(emp.base_salary);
  const basePayLkr = ho.mnrBaseSalaryLkr;
  return finalizeEmployeePay(
    {
      id: emp.id,
      empNumber: emp.emp_number ?? '',
      name: emp.full_name ?? '',
      rank: emp.rank ?? 'Staff',
      corporateGroup: 'HEAD_OFFICE',
      shiftsAtSite: 0,
      totalDeductions: 0,
      deductions: [],
      earnings: {
        crossSiteDistribution: [{ site: 'CVS', shifts: 0 }],
        hoFixedData: ho,
        dayTypeBreakdown: minimalDayTypes(0, 0),
      },
    },
    emp,
    basePayLkr,
    variableByEmployee,
  );
}

function buildCafeEmployee(
  emp: PortfolioEmployeeRow,
  variableByEmployee: Map<string, VariablePayrollEarnings>,
): FmPortfolioEmployeeSeed {
  const basic = Number(emp.base_salary) || 45_000;
  const daysWorked = 20;
  const basePay = Math.round((basic / 26) * daysWorked);
  const otHours = 4;
  const otPay = Math.round(((basic / 26 / 9) * 1.5) * otHours);
  const basePayLkr = basePay + otPay;
  return finalizeEmployeePay(
    {
      id: emp.id,
      empNumber: emp.emp_number ?? '',
      name: emp.full_name ?? '',
      rank: emp.rank ?? 'Café Staff',
      corporateGroup: 'CAFE',
      shiftsAtSite: 0,
      totalDeductions: 0,
      deductions: [],
      earnings: {
        crossSiteDistribution: [],
        cafeData: {
          monthlyBasicLkr: basic,
          daysWorked,
          totalOT: otHours,
          basePayLkr: basePay,
          otPayLkr: otPay,
        },
        dayTypeBreakdown: minimalDayTypes(0, 0),
      },
    },
    emp,
    basePayLkr,
    variableByEmployee,
  );
}

function buildSmEmployee(
  emp: PortfolioEmployeeRow,
  visits: number,
  patrolSites: string[],
  variableByEmployee: Map<string, VariablePayrollEarnings>,
): FmPortfolioEmployeeSeed {
  const { visitPayLkr, fixedBasicLkr, totalGrossLkr } = computeSmGrossLkr(visits);
  return finalizeEmployeePay(
    {
      id: emp.id,
      empNumber: emp.emp_number ?? '',
      name: emp.full_name ?? '',
      rank: emp.rank ?? 'Sector Manager',
      corporateGroup: 'SECTOR_MANAGER',
      shiftsAtSite: 0,
      totalDeductions: 0,
      deductions: [],
      earnings: {
        crossSiteDistribution: patrolSites.map((site) => ({ site, shifts: 0 })),
        smPayData: {
          payMode: FM_SM_COMPENSATION.payMode,
          visitsCompleted: visits,
          visitsTarget: 20,
          perVisitRateLkr: FM_SM_COMPENSATION.perVisitRateLkr,
          visitPayLkr,
          fixedBasicLkr,
        },
        dayTypeBreakdown: minimalDayTypes(0, 0),
      },
    },
    emp,
    totalGrossLkr,
    variableByEmployee,
  );
}

function sumPayrollCost(employees: FmPortfolioEmployeeSeed[]): number {
  return employees.reduce((s, e) => s + e.totalGross, 0);
}

function buildStaffPinnedSitePair(
  kind: StaffPayrollKind,
  employees: Awaited<ReturnType<typeof fetchEmployees>>,
  buildEmployee: (
    emp: Awaited<ReturnType<typeof fetchEmployees>>[number],
  ) => FmPortfolioEmployeeSeed,
  bankSite: {
    id: string;
    name: string;
    location: string;
  },
): FmPortfolioSiteSeed[] {
  const withBank: FmPortfolioEmployeeSeed[] = [];
  const noBank: FmPortfolioEmployeeSeed[] = [];

  employees.forEach((emp) => {
    const built = buildEmployee(emp);
    if (hasBankOnFile(emp.bank_name as string | null)) {
      withBank.push(built);
    } else {
      noBank.push(built);
    }
  });

  const noBankCohort = staffNoBankCohortForKind(kind);
  const noBankMeta = STAFF_NO_BANK_META[noBankCohort];

  return [
    {
      id: bankSite.id,
      name: bankSite.name,
      location: bankSite.location,
      clientBilled: 0,
      payrollCost: sumPayrollCost(withBank),
      payrollGroup: kind,
      displayEmployeeCount: withBank.length,
      employees: withBank,
    },
    {
      id: STAFF_NO_BANK_SITE_IDS[noBankCohort],
      name: noBankMeta.name,
      location: noBankMeta.location,
      clientBilled: 0,
      payrollCost: sumPayrollCost(noBank),
      payrollGroup: noBankCohort,
      displayEmployeeCount: noBank.length,
      employees: noBank,
    },
  ];
}

function applyDeductionBundleToEmployee(
  emp: FmPortfolioEmployeeSeed,
  payrollPeriod: PayrollPeriod,
  hqByEmployee: Map<string, { meals: number; uniform: number }>,
  advancesByProfile: Map<string, number>,
  plansByEmployee: Map<string, FmEmployeeDeductionPlanRow[]>,
): FmPortfolioEmployeeSeed {
  const deductions = mergePortfolioDeductionsForEmployee(
    emp.id,
    payrollPeriod,
    hqByEmployee,
    advancesByProfile,
    plansByEmployee,
  );
  return recalcEmployeeDeductionTotals({ ...emp, deductions });
}

function applyDeductionBundleToSites(
  sites: FmPortfolioSiteSeed[],
  payrollPeriod: PayrollPeriod,
  hqByEmployee: Map<string, { meals: number; uniform: number }>,
  advancesByProfile: Map<string, number>,
  plansByEmployee: Map<string, FmEmployeeDeductionPlanRow[]>,
): FmPortfolioSiteSeed[] {
  return sites.map((site) => {
    const employees = site.employees.map((emp) =>
      applyDeductionBundleToEmployee(
        emp,
        payrollPeriod,
        hqByEmployee,
        advancesByProfile,
        plansByEmployee,
      ),
    );
    return {
      ...site,
      employees,
      payrollCost: sumPayrollCost(employees),
    };
  });
}

/** Live FM portfolio from employees, sites, time shifts, and SM visits. */
export async function getFmPortfolio(
  payrollPeriod: PayrollPeriod = FM_LIVE_PAYROLL_PERIOD,
): Promise<FmPortfolioPayload> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ...EMPTY, error: 'No company context' };

  const payrollMonth = payrollMonthFromFmPeriod(payrollPeriod);
  const periodEndIso = payrollPeriodEndIso(payrollPeriod);
  const [employees, sites, shiftCounts, smVisits, adjustments, siteStaffAssignments, variableByEmployee, rankMatrix] =
    await Promise.all([
      fetchWithRosterCompanyFallback(fetchEmployees, companyId),
      fetchWithRosterCompanyFallback(fetchSites, companyId),
      fetchShiftCounts(companyId, payrollMonth),
      fetchSmVisits(companyId, payrollMonth),
      fetchShiftAdjustments(companyId, payrollMonth),
      fetchSiteStaffAssignments(companyId),
      fetchPayrollEarningsAdjustments(companyId, payrollPeriod),
      getRankPayMatrix(),
    ]);

  const activeSites = sites.filter(
    (site) => String(site.site_status ?? 'ACTIVE').toUpperCase() !== 'ARCHIVED',
  );
  const clientGuardSites = activeSites.filter((site) => inferSiteKind(site) === 'client');
  const cafeBranchSites = activeSites.filter((site) => inferSiteKind(site) === 'cafe_branch');
  const headOfficeSites = activeSites.filter((site) => inferSiteKind(site) === 'head_office');
  const cafeBranchLabels = cafeBranchSites.map((site) => String(site.site_name ?? '').trim()).filter(Boolean);

  const staffEpfsBySiteId = new Map<string, string[]>();
  siteStaffAssignments.forEach((row) => {
    const siteId = String(row.site_profile_id);
    const epf = String(row.staff_epf ?? '').trim().toUpperCase();
    if (!epf) return;
    const list = staffEpfsBySiteId.get(siteId) ?? [];
    list.push(epf);
    staffEpfsBySiteId.set(siteId, list);
  });

  const hoEmployees = dedupeEmployees([
    ...employees.filter((e) => isEmployeeCorporateGroup(e, 'HEAD_OFFICE')),
    ...headOfficeSites.flatMap((site) =>
      matchEmployeesByEpfs(employees, staffEpfsBySiteId.get(String(site.id)) ?? []),
    ),
  ]);
  const smEmployees = employees.filter((e) => isEmployeeCorporateGroup(e, 'SECTOR_MANAGER'));
  const cafeEmployees = dedupeEmployees([
    ...employees.filter((e) => isEmployeeCorporateGroup(e, 'CAFE')),
    ...cafeBranchSites.flatMap((site) =>
      matchEmployeesByEpfs(employees, staffEpfsBySiteId.get(String(site.id)) ?? []),
    ),
  ]);
  const guardEmployees = employees.filter((e) => isEmployeeCorporateGroup(e, 'GUARD_FIELD'));

  const siteNames = clientGuardSites.map((s) => s.site_name);
  const pinnedSites: FmPortfolioSiteSeed[] = [];

  pinnedSites.push(
    ...buildStaffPinnedSitePair(
      'ho',
      hoEmployees,
      (emp) => buildHoEmployee(emp, variableByEmployee),
      {
      id: PINNED_HO_SITE_ID,
      name: 'CVS',
      location: 'Head office employees · all branches',
    },
    ),
  );

  pinnedSites.push(
    ...buildStaffPinnedSitePair(
      'sm',
      smEmployees,
      (emp) => {
        const visits = smVisits.get(emp.emp_number ?? '') ?? 0;
        return buildSmEmployee(emp, visits, siteNames.slice(0, 6), variableByEmployee);
      },
      {
        id: PINNED_SM_SITE_ID,
        name: 'SM CVS',
        location: 'SM group · sector managers · visit-based pay',
      },
    ),
  );

  pinnedSites.push(
    ...buildStaffPinnedSitePair(
      'cafe',
      cafeEmployees,
      (emp) => buildCafeEmployee(emp, variableByEmployee),
      {
      id: PINNED_CAFE_SITE_ID,
      name: 'Café',
      location:
        cafeBranchLabels.length > 0
          ? `Café operations · ${cafeBranchLabels.join(' · ')}`
          : 'Café operations · all branches',
    },
    ),
  );

  pinnedSites.push(
    ...buildGuardCohortPinnedSites(
      guardEmployees,
      clientGuardSites,
      shiftCounts,
      variableByEmployee,
      rankMatrix,
      periodEndIso,
    ),
  );

  const guardsBySite = new Map<string, typeof guardEmployees>();
  guardEmployees.forEach((emp) => {
    const siteKey = (emp.site as string | null)?.trim() || 'Unassigned';
    const list = guardsBySite.get(siteKey) ?? [];
    list.push(emp);
    guardsBySite.set(siteKey, list);
  });

  const clientSites: FmPortfolioSiteSeed[] = clientGuardSites.map((site) => {
    const siteGuards =
      guardsBySite.get(site.site_name) ??
      guardEmployees.filter((g) =>
        (g.site as string | null)?.toLowerCase().includes(site.site_name.toLowerCase().slice(0, 8)),
      );
    const emps = siteGuards.map((emp) =>
      buildGuardEmployee(
        emp,
        site.id,
        site.site_name,
        shiftCounts,
        variableByEmployee,
        rankMatrix,
        periodEndIso,
      ),
    );
    const payrollCost = sumPayrollCost(emps);
    const rateMatrix = site.rate_matrix as Record<string, number> | null;
    const billedRate = rateMatrix?.JSO ?? rateMatrix?.jso ?? 2200;
    const clientBilled = Math.round(
      emps.reduce((s, e) => s + e.shiftsAtSite * billedRate, 0),
    );
    return {
      id: site.id,
      name: site.site_name,
      location: (site.address as string | null) ?? '',
      clientBilled: clientBilled || payrollCost,
      payrollCost,
      employees: emps,
    };
  });

  const shiftAdjustments: FmPortfolioPayload['shiftAdjustments'] = {};
  adjustments.forEach((row) => {
    const key = `${row.site_key}:${row.employee_id}`;
    const existing = shiftAdjustments[key] ?? { delta: 0, audit: [] };
    existing.delta += row.delta_shifts;
    existing.audit.push({
      at: row.created_at,
      detail: row.detail,
      previousShifts: row.previous_shifts,
      newShifts: row.new_shifts,
    });
    shiftAdjustments[key] = existing;
  });

  const allEmployeeIds = [
    ...hoEmployees.map((e) => e.id),
    ...smEmployees.map((e) => e.id),
    ...cafeEmployees.map((e) => e.id),
    ...guardEmployees.map((e) => e.id),
  ];

  const [hqByEmployee, advancesByProfile, plansByEmployee] = await Promise.all([
    fetchHqMonthlyDeductions(companyId, payrollMonth),
    fetchApprovedSalaryAdvances(companyId, payrollPeriod.year, payrollPeriod.month),
    fetchActiveFmDeductionPlans(companyId, allEmployeeIds),
  ]);

  const withDeductions = (sites: FmPortfolioSiteSeed[]) =>
    applyDeductionBundleToSites(
      sites,
      payrollPeriod,
      hqByEmployee,
      advancesByProfile,
      plansByEmployee,
    );

  return {
    pinnedSites: ensurePinnedPayrollSites<FmPortfolioSiteSeed>(
      withDeductions(pinnedSites),
      cafeBranchLabels,
    ),
    sites: withDeductions(clientSites),
    shiftAdjustments,
  };
}

/** Persist an FM shift adjustment for the active payroll month. */
export async function saveFmShiftAdjustment(input: {
  employeeId: string;
  siteKey: string;
  payrollMonth: string;
  delta: number;
  previousShifts: number;
  newShifts: number;
  detail: string;
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from('fm_shift_adjustments').insert({
    company_id: companyId,
    employee_id: input.employeeId,
    site_key: input.siteKey,
    payroll_month: input.payrollMonth,
    delta_shifts: input.delta,
    previous_shifts: input.previousShifts,
    new_shifts: input.newShifts,
    detail: input.detail,
    source: 'FM',
  });

  if (error) {
    console.error('❌ SUPABASE ERROR (saveFmShiftAdjustment):', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Persist FM payroll earnings adjustments and site allowance for the active month. */
export async function saveFmPayrollEarningsAdjustment(input: {
  employeeId: string;
  payrollPeriod: PayrollPeriod;
  arrearsLkr: number;
  performanceIncentiveLkr: number;
  siteAllowanceLkr: number;
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const supabase = createSupabaseServiceClient();
  const siteAllowanceLkr = Math.max(0, Math.round(input.siteAllowanceLkr));
  const row = {
    company_id: companyId,
    employee_id: input.employeeId,
    period_year: input.payrollPeriod.year,
    period_month: input.payrollPeriod.month,
    arrears_lkr: Math.max(0, Math.round(input.arrearsLkr)),
    performance_incentive_lkr: Math.max(0, Math.round(input.performanceIncentiveLkr)),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('fm_payroll_earnings_adjustments').upsert(row, {
    onConflict: 'company_id,employee_id,period_year,period_month',
  });

  if (error) {
    if (/does not exist|42P01/i.test(error.message)) {
      return { ok: false, error: 'Run npm run db:apply-employee-allowances first.' };
    }
    console.error('❌ SUPABASE ERROR (saveFmPayrollEarningsAdjustment):', error.message);
    return { ok: false, error: error.message };
  }

  const { error: empError } = await supabase
    .from('employees')
    .update({ site_allowance_lkr: siteAllowanceLkr })
    .eq('id', input.employeeId)
    .eq('company_id', companyId);

  if (empError) {
    console.error('❌ SUPABASE ERROR (saveFmPayrollEarningsAdjustment site allowance):', empError.message);
    return { ok: false, error: empError.message };
  }

  return { ok: true };
}
