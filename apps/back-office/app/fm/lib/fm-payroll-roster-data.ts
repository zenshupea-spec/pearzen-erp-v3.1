import type { FmPortfolioDeduction, FmPortfolioSiteSeed } from '../portfolio-actions';
import type { GuardPayrollCohort, PinnedPayrollGroupKind } from './guard-payroll-cohorts';

export type FmShiftTypeLine = {
  label: string;
  shifts: number;
  amountLkr: number;
};

export type PayrollWorkforceGroup = 'cvs' | 'cvs_sm' | 'cafe' | 'guard';

export type PayrollWorkforceFilter = 'all' | PayrollWorkforceGroup;

export type RosterSortKey =
  | 'name'
  | 'rank'
  | 'epf'
  | 'sector'
  | 'site'
  | 'salary'
  | 'gross'
  | 'deductions'
  | 'net';

export type FmPayrollRosterRow = {
  id: string;
  workforceGroup: PayrollWorkforceGroup;
  payrollGroup?: PinnedPayrollGroupKind;
  epfNo: string;
  empNumber: string;
  name: string;
  rank: string;
  sector: string;
  site: string;
  salaryLkr: number;
  earningsLkr: number;
  deductionsLkr: number;
  advanceDeductionLkr: number;
  netPayLkr: number;
  payslipId: string;
  totalShifts?: number;
  daysWorked?: number;
  shiftTypeLines?: FmShiftTypeLine[];
  basicShiftPaidLkr?: number;
  bra1Lkr?: number;
  bra2Lkr?: number;
  noPayRecoveryDays?: number;
  noPayRecoveryLkr?: number;
  adjustedBasicTotalLkr?: number;
  siteAllowanceLkr?: number;
  attendanceAllowanceLkr?: number;
  mealAllowanceLkr?: number;
  transportAllowanceLkr?: number;
  extraOtLkr?: number;
  arrearsLkr?: number;
  performanceIncentiveLkr?: number;
  deductionLines?: { type: FmPortfolioDeduction['type']; amountLkr: number }[];
  mealsDeductionLkr?: number;
  accommodationDeductionLkr?: number;
  deathDonationsLkr?: number;
  weddingGiftsDeductionLkr?: number;
  extraItemsDeductionLkr?: number;
  unitDamagesDeductionLkr?: number;
  trainingDeductionLkr?: number;
  salaryLoanDeductionLkr?: number;
  uniformsDeductionLkr?: number;
  otherDeductionsLkr?: number;
  payeeTaxLkr?: number;
  stampDutyLkr?: number;
  epfEmployeeLkr?: number;
  epfEmployerLkr?: number;
  etfEmployerLkr?: number;
  bankName?: string;
  bankAccountNo?: string;
};

type PortfolioSeedEmployee = FmPortfolioSiteSeed['employees'][number];
type PortfolioSeedSite = FmPortfolioSiteSeed;

const WORKFORCE_LABELS: Record<PayrollWorkforceGroup, string> = {
  cvs: 'CVS',
  cvs_sm: 'SM CVS',
  cafe: 'Café',
  guard: 'Guards',
};

export function workforceGroupLabel(group: PayrollWorkforceGroup): string {
  return WORKFORCE_LABELS[group];
}

export function workforceGroupFromSite(
  payrollGroup?: PinnedPayrollGroupKind,
): PayrollWorkforceGroup {
  if (payrollGroup === 'ho' || payrollGroup === 'ho_no_bank') return 'cvs';
  if (payrollGroup === 'sm' || payrollGroup === 'sm_no_bank') return 'cvs_sm';
  if (payrollGroup === 'cafe' || payrollGroup === 'cafe_no_bank') return 'cafe';
  return 'guard';
}

function inferSector(location: string, siteName: string): string {
  const t = `${location} ${siteName}`.toLowerCase();
  if (t.includes('kandy') || t.includes('kurunegala') || t.includes('matale')) return 'Central';
  if (
    t.includes('galle') ||
    t.includes('matara') ||
    t.includes('hambantota') ||
    t.includes('ratnapura')
  ) {
    return 'Southern';
  }
  if (t.includes('jaffna') || t.includes('trincomalee') || t.includes('batticaloa')) {
    return 'Eastern';
  }
  if (t.includes('anuradhapura') || t.includes('polonnaruwa')) return 'North Central';
  return 'Western';
}

function inferEpfNo(empNumber: string, workforceGroup: PayrollWorkforceGroup): string {
  const digits = empNumber.replace(/\D/g, '');
  if (workforceGroup === 'guard') {
    return digits || '—';
  }
  if (workforceGroup === 'cvs') {
    return digits ? `EPF-HO-${digits}` : '—';
  }
  if (workforceGroup === 'cvs_sm') {
    return digits ? `EPF-SM-${digits.padStart(4, '0')}` : '—';
  }
  if (workforceGroup === 'cafe') {
    return digits ? `EPF-CT-${digits}` : '—';
  }
  return digits ? `EPF-${digits.padStart(6, '0')}` : '—';
}

const SHIFT_TYPE_LABELS: Record<
  PortfolioSeedEmployee['earnings']['dayTypeBreakdown'][number]['type'],
  string
> = {
  'Normal Days': 'Basic shift pay',
  Saturdays: 'Saturday',
  Sundays: 'Sunday',
  'Poya Days': 'Poyaday',
  'Public Holidays': 'Public Holiday',
};

function shiftTypeLinesFromEmployee(emp: PortfolioSeedEmployee): FmShiftTypeLine[] {
  return emp.earnings.dayTypeBreakdown.map((entry) => ({
    label: SHIFT_TYPE_LABELS[entry.type],
    shifts: entry.totalShifts,
    amountLkr: entry.lkrEarned,
  }));
}

function deductionLinesFromEmployee(emp: PortfolioSeedEmployee) {
  return emp.deductions.map((deduction) => ({
    type: deduction.type,
    amountLkr: deduction.thisMonthAmount,
  }));
}

function salaryFromEmployee(emp: PortfolioSeedEmployee): number {
  if (emp.earnings.hoFixedData) return emp.earnings.hoFixedData.mnrBaseSalaryLkr;
  if (emp.earnings.cafeData) return emp.earnings.cafeData.monthlyBasicLkr;
  if (emp.earnings.guardData) return emp.earnings.guardData.monthlyBasicLkr;
  return Math.round(emp.totalGross / 1.05);
}

function primarySiteLabel(
  emp: PortfolioSeedEmployee,
  fallbackSiteName: string,
): string {
  const dist = emp.earnings.crossSiteDistribution;
  if (!dist?.length) return fallbackSiteName;
  const primary = dist.reduce((a, b) => (b.shifts > a.shifts ? b : a), dist[0]);
  return primary.shifts > 0 ? primary.site : fallbackSiteName;
}

function advanceDeductionLkr(emp: PortfolioSeedEmployee): number {
  return emp.deductions
    .filter((deduction) => deduction.type === 'Advance')
    .reduce((sum, deduction) => sum + deduction.thisMonthAmount, 0);
}

function deductionAmountByType(emp: PortfolioSeedEmployee, type: string): number {
  return emp.deductions
    .filter((deduction) => deduction.type === type)
    .reduce((sum, deduction) => sum + deduction.thisMonthAmount, 0);
}

function flattenSite(site: PortfolioSeedSite): FmPayrollRosterRow[] {
  const workforceGroup = workforceGroupFromSite(site.payrollGroup);
  const sector = inferSector(site.location, site.name);

  return site.employees.map((emp) => {
    const shiftTypeLines = shiftTypeLinesFromEmployee(emp);
    const basicShiftPaidLkr = shiftTypeLines.reduce((sum, line) => sum + line.amountLkr, 0);
    const totalShifts = emp.shiftsAtSite;
    const salaryLkr = salaryFromEmployee(emp);
    const fixedAllowances = emp.earnings.fixedAllowances;
    const variableEarnings = emp.earnings.variableEarnings;
    const siteAllowanceLkr =
      fixedAllowances != null
        ? fixedAllowances.siteAllowanceLkr
        : Math.max(0, emp.totalGross - basicShiftPaidLkr);
    const mealAllowanceLkr = fixedAllowances?.mealAllowanceLkr ?? 0;
    const transportAllowanceLkr = fixedAllowances?.transportAllowanceLkr ?? 0;
    const arrearsLkr = variableEarnings?.arrearsLkr ?? 0;
    const performanceIncentiveLkr = variableEarnings?.performanceIncentiveLkr ?? 0;

    return {
      id: emp.id,
      workforceGroup,
      payrollGroup: site.payrollGroup,
      epfNo: inferEpfNo(emp.empNumber, workforceGroup),
      empNumber: emp.empNumber,
      name: emp.name,
      rank: emp.rank,
      sector,
      site: primarySiteLabel(emp, site.name),
      salaryLkr,
      earningsLkr: emp.totalGross,
      deductionsLkr: emp.totalDeductions,
      advanceDeductionLkr: advanceDeductionLkr(emp),
      netPayLkr: emp.netTakeHome,
      payslipId: `PS-${emp.empNumber.replace(/[^A-Z0-9]/gi, '')}-202605`,
      totalShifts,
      daysWorked: emp.earnings.cafeData?.daysWorked ?? totalShifts,
      shiftTypeLines,
      basicShiftPaidLkr,
      siteAllowanceLkr,
      mealAllowanceLkr,
      transportAllowanceLkr,
      arrearsLkr,
      performanceIncentiveLkr,
      extraOtLkr: emp.earnings.cafeData?.otPayLkr ?? 0,
      deductionLines: deductionLinesFromEmployee(emp),
      mealsDeductionLkr: deductionAmountByType(emp, 'Meals'),
      uniformsDeductionLkr: deductionAmountByType(emp, 'Uniform'),
      deathDonationsLkr: deductionAmountByType(emp, 'Death Donation'),
      weddingGiftsDeductionLkr: deductionAmountByType(emp, 'Wedding Gifts'),
      extraItemsDeductionLkr: deductionAmountByType(emp, 'Extra Items'),
      unitDamagesDeductionLkr: deductionAmountByType(emp, 'Unit Damages'),
      trainingDeductionLkr: deductionAmountByType(emp, 'Training'),
      salaryLoanDeductionLkr: deductionAmountByType(emp, 'Salary Loan'),
      otherDeductionsLkr:
        deductionAmountByType(emp, 'Other Deductions') +
        deductionAmountByType(emp, 'Penalty'),
      adjustedBasicTotalLkr: salaryLkr,
    };
  });
}

export function buildFmPayrollRoster(
  pinnedSites: FmPortfolioSiteSeed[] = [],
  clientSites: FmPortfolioSiteSeed[] = [],
): FmPayrollRosterRow[] {
  const rows = [
    ...pinnedSites.flatMap(flattenSite),
    ...clientSites.flatMap(flattenSite),
  ];
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function filterPayrollRoster(
  rows: FmPayrollRosterRow[],
  opts: {
    query: string;
    workforce: PayrollWorkforceFilter;
  },
): FmPayrollRosterRow[] {
  const q = opts.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (opts.workforce !== 'all' && row.workforceGroup !== opts.workforce) return false;
    if (!q) return true;
    const haystack = [
      row.name,
      row.rank,
      row.epfNo,
      row.empNumber,
      row.sector,
      row.site,
      workforceGroupLabel(row.workforceGroup),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function sortPayrollRoster(
  rows: FmPayrollRosterRow[],
  key: RosterSortKey,
  direction: 'asc' | 'desc',
): FmPayrollRosterRow[] {
  const dir = direction === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    switch (key) {
      case 'salary':
        return (a.salaryLkr - b.salaryLkr) * dir;
      case 'gross':
        return (a.earningsLkr - b.earningsLkr) * dir;
      case 'deductions':
        return (a.deductionsLkr - b.deductionsLkr) * dir;
      case 'net':
        return (a.netPayLkr - b.netPayLkr) * dir;
      case 'rank':
        return a.rank.localeCompare(b.rank) * dir;
      case 'epf':
        return a.epfNo.localeCompare(b.epfNo) * dir;
      case 'sector':
        return a.sector.localeCompare(b.sector) * dir || a.name.localeCompare(b.name) * dir;
      case 'site':
        return a.site.localeCompare(b.site) * dir || a.name.localeCompare(b.name) * dir;
      case 'name':
      default:
        return a.name.localeCompare(b.name) * dir;
    }
  });
  return sorted;
}

export function rosterTotals(rows: FmPayrollRosterRow[]) {
  return rows.reduce(
    (acc, row) => ({
      count: acc.count + 1,
      gross: acc.gross + row.earningsLkr,
      deductions: acc.deductions + row.deductionsLkr,
      net: acc.net + row.netPayLkr,
    }),
    { count: 0, gross: 0, deductions: 0, net: 0 },
  );
}

export const WORKFORCE_FILTER_OPTIONS: {
  id: PayrollWorkforceFilter;
  label: string;
  short: string;
}[] = [
  { id: 'all', label: 'All workforce', short: 'All' },
  { id: 'cvs', label: 'CVS — Head Office', short: 'CVS' },
  { id: 'cvs_sm', label: 'SM group — SM CVS', short: 'SM CVS' },
  { id: 'cafe', label: 'Café Tasha', short: 'Café' },
  { id: 'guard', label: 'Field guards', short: 'Guards' },
];

export const ROSTER_SORT_OPTIONS: { id: RosterSortKey; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'rank', label: 'Rank' },
  { id: 'epf', label: 'EPF No' },
  { id: 'sector', label: 'Sector' },
  { id: 'site', label: 'Site' },
  { id: 'salary', label: 'Salary / Basic' },
  { id: 'gross', label: 'Earnings' },
  { id: 'deductions', label: 'Deductions' },
  { id: 'net', label: 'Net pay' },
];

const GROUP_ACCENT: Record<PayrollWorkforceGroup, string> = {
  cvs: 'border-l-indigo-500 bg-indigo-50/40',
  cvs_sm: 'border-l-sky-500 bg-sky-50/30',
  cafe: 'border-l-violet-500 bg-violet-50/30',
  guard: 'border-l-slate-400 bg-white',
};

export function rosterRowAccent(group: PayrollWorkforceGroup): string {
  return GROUP_ACCENT[group];
}
