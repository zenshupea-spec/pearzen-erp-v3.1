'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../packages/supabase/service';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../lib/company-context';
import {
  FM_SM_COMPENSATION,
  computeSmGrossLkr,
} from './lib/sm-pay-settings';
import { hoFixedFromMnrBaseSalary } from './lib/payroll-earnings-display';
import { FM_LIVE_PAYROLL_PERIOD, type PayrollPeriod } from './lib/payroll-period';
import { payrollMonthFromFmPeriod } from '../../lib/deduction-month-lock-storage';

export type FmPortfolioDeduction = {
  type: 'Meals' | 'Uniform' | 'Penalty' | 'Advance';
  totalLiability: number;
  installmentCurrent: number;
  installmentTotal: number;
  thisMonthAmount: number;
};

export type FmPortfolioEmployeeSeed = {
  id: string;
  empNumber: string;
  name: string;
  rank: string;
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
  payrollGroup?: 'cafe' | 'ho' | 'sm';
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

function minimalDayTypes(normalShifts: number, normalLkr: number) {
  return [
    { type: 'Normal Days' as const, totalShifts: normalShifts, rateMultiplier: '1.0x', lkrEarned: normalLkr, dates: [] },
    { type: 'Sundays' as const, totalShifts: 0, rateMultiplier: '1.5x', lkrEarned: 0, dates: [] },
    { type: 'Poya Days' as const, totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
    { type: 'Public Holidays' as const, totalShifts: 0, rateMultiplier: '2.0x', lkrEarned: 0, dates: [] },
    { type: 'Saturdays' as const, totalShifts: 0, rateMultiplier: '1.25x', lkrEarned: 0, dates: [] },
  ];
}

function guardGrossFromShifts(shifts: number, baseSalary = 1850): number {
  return Math.round(shifts * baseSalary);
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
    .select('id, emp_number, full_name, rank, site, group, status, base_salary')
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
    .select('id, site_name, client_name, address, rate_matrix')
    .order('site_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) return [];
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

function buildGuardEmployee(
  emp: Awaited<ReturnType<typeof fetchEmployees>>[number],
  siteId: string,
  siteName: string,
  shiftCounts: Map<string, number>,
): FmPortfolioEmployeeSeed {
  const shifts = shiftCounts.get(`${emp.id}:${siteId}`) ?? 0;
  const gross = guardGrossFromShifts(shifts);
  return {
    id: emp.id,
    empNumber: emp.emp_number ?? '',
    name: emp.full_name ?? '',
    rank: emp.rank ?? 'Guard',
    shiftsAtSite: shifts,
    totalGross: gross,
    totalDeductions: 0,
    netTakeHome: gross,
    deductions: [],
    earnings: {
      crossSiteDistribution: [{ site: siteName, shifts }],
      dayTypeBreakdown: minimalDayTypes(shifts, gross),
    },
  };
}

function buildHoEmployee(
  emp: Awaited<ReturnType<typeof fetchEmployees>>[number],
): FmPortfolioEmployeeSeed {
  const ho = hoFixedFromMnrBaseSalary(emp.base_salary);
  const gross = ho?.mnrBaseSalaryLkr ?? 0;
  return {
    id: emp.id,
    empNumber: emp.emp_number ?? '',
    name: emp.full_name ?? '',
    rank: emp.rank ?? 'Staff',
    shiftsAtSite: 0,
    totalGross: gross,
    totalDeductions: 0,
    netTakeHome: gross,
    deductions: [],
    earnings: {
      crossSiteDistribution: [],
      hoFixedData: ho,
      dayTypeBreakdown: minimalDayTypes(0, 0),
    },
  };
}

function buildCafeEmployee(
  emp: Awaited<ReturnType<typeof fetchEmployees>>[number],
): FmPortfolioEmployeeSeed {
  const basic = Number(emp.base_salary) || 45_000;
  const daysWorked = 20;
  const basePay = Math.round((basic / 26) * daysWorked);
  const otHours = 4;
  const otPay = Math.round(((basic / 26 / 9) * 1.5) * otHours);
  const gross = basePay + otPay;
  return {
    id: emp.id,
    empNumber: emp.emp_number ?? '',
    name: emp.full_name ?? '',
    rank: emp.rank ?? 'Café Staff',
    shiftsAtSite: 0,
    totalGross: gross,
    totalDeductions: 0,
    netTakeHome: gross,
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
  };
}

function buildSmEmployee(
  emp: Awaited<ReturnType<typeof fetchEmployees>>[number],
  visits: number,
  patrolSites: string[],
): FmPortfolioEmployeeSeed {
  const { visitPayLkr, fixedBasicLkr, totalGrossLkr } = computeSmGrossLkr(visits);
  return {
    id: emp.id,
    empNumber: emp.emp_number ?? '',
    name: emp.full_name ?? '',
    rank: emp.rank ?? 'Sector Manager',
    shiftsAtSite: 0,
    totalGross: totalGrossLkr,
    totalDeductions: 0,
    netTakeHome: totalGrossLkr,
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
  };
}

function sumPayrollCost(employees: FmPortfolioEmployeeSeed[]): number {
  return employees.reduce((s, e) => s + e.totalGross, 0);
}

/** Live FM portfolio from employees, sites, time shifts, and SM visits. */
export async function getFmPortfolio(
  payrollPeriod: PayrollPeriod = FM_LIVE_PAYROLL_PERIOD,
): Promise<FmPortfolioPayload> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ...EMPTY, error: 'No company context' };

  const payrollMonth = payrollMonthFromFmPeriod(payrollPeriod);
  const [employees, sites, shiftCounts, smVisits, adjustments] = await Promise.all([
    fetchWithRosterCompanyFallback(fetchEmployees, companyId),
    fetchWithRosterCompanyFallback(fetchSites, companyId),
    fetchShiftCounts(companyId, payrollMonth),
    fetchSmVisits(companyId, payrollMonth),
    fetchShiftAdjustments(companyId, payrollMonth),
  ]);

  const hoEmployees = employees.filter((e) => e.group === 'HEAD_OFFICE');
  const smEmployees = employees.filter((e) => e.group === 'SECTOR_MANAGER');
  const cafeEmployees = employees.filter((e) => e.group === 'CAFE');
  const guardEmployees = employees.filter(
    (e) => e.group === 'GUARD' || e.group === 'GUARD_FIELD',
  );

  const siteNames = sites.map((s) => s.site_name);
  const pinnedSites: FmPortfolioSiteSeed[] = [];

  if (hoEmployees.length) {
    const emps = hoEmployees.map(buildHoEmployee);
    pinnedSites.push({
      id: 'group-cvs',
      name: 'CVS',
      location: 'Head Office & administration',
      clientBilled: 0,
      payrollCost: sumPayrollCost(emps),
      payrollGroup: 'ho',
      displayEmployeeCount: emps.length,
      employees: emps,
    });
  }

  if (smEmployees.length) {
    const emps = smEmployees.map((emp) => {
      const visits = smVisits.get(emp.emp_number ?? '') ?? 0;
      return buildSmEmployee(emp, visits, siteNames.slice(0, 6));
    });
    pinnedSites.push({
      id: 'group-cvs-sm',
      name: 'CVS SM',
      location: 'Sector managers — visit-based pay',
      clientBilled: 0,
      payrollCost: sumPayrollCost(emps),
      payrollGroup: 'sm',
      displayEmployeeCount: emps.length,
      employees: emps,
    });
  }

  if (cafeEmployees.length) {
    const emps = cafeEmployees.map(buildCafeEmployee);
    pinnedSites.push({
      id: 'group-cafe',
      name: 'Café Tasha',
      location: 'Café operations payroll',
      clientBilled: 0,
      payrollCost: sumPayrollCost(emps),
      payrollGroup: 'cafe',
      displayEmployeeCount: emps.length,
      employees: emps,
    });
  }

  const guardsBySite = new Map<string, typeof guardEmployees>();
  guardEmployees.forEach((emp) => {
    const siteKey = (emp.site as string | null)?.trim() || 'Unassigned';
    const list = guardsBySite.get(siteKey) ?? [];
    list.push(emp);
    guardsBySite.set(siteKey, list);
  });

  const clientSites: FmPortfolioSiteSeed[] = sites.map((site) => {
    const siteGuards =
      guardsBySite.get(site.site_name) ??
      guardEmployees.filter((g) =>
        (g.site as string | null)?.toLowerCase().includes(site.site_name.toLowerCase().slice(0, 8)),
      );
    const emps = siteGuards.map((emp) =>
      buildGuardEmployee(emp, site.id, site.site_name, shiftCounts),
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

  return { pinnedSites, sites: clientSites, shiftAdjustments };
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
