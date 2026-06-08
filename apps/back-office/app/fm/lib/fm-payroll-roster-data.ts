import type { FmPortfolioSiteSeed } from '../portfolio-actions';

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
  epfNo: string;
  empNumber: string;
  name: string;
  rank: string;
  sector: string;
  site: string;
  salaryLkr: number;
  earningsLkr: number;
  deductionsLkr: number;
  netPayLkr: number;
  payslipId: string;
};

type PortfolioSeedEmployee = FmPortfolioSiteSeed['employees'][number];
type PortfolioSeedSite = FmPortfolioSiteSeed;

const WORKFORCE_LABELS: Record<PayrollWorkforceGroup, string> = {
  cvs: 'CVS',
  cvs_sm: 'CVS SM',
  cafe: 'Café',
  guard: 'Guards',
};

export function workforceGroupLabel(group: PayrollWorkforceGroup): string {
  return WORKFORCE_LABELS[group];
}

export function workforceGroupFromSite(
  payrollGroup?: 'ho' | 'sm' | 'cafe',
): PayrollWorkforceGroup {
  if (payrollGroup === 'ho') return 'cvs';
  if (payrollGroup === 'sm') return 'cvs_sm';
  if (payrollGroup === 'cafe') return 'cafe';
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

function salaryFromEmployee(emp: PortfolioSeedEmployee): number {
  if (emp.earnings.hoFixedData) return emp.earnings.hoFixedData.mnrBaseSalaryLkr;
  if (emp.earnings.cafeData) return emp.earnings.cafeData.monthlyBasicLkr;
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

function flattenSite(site: PortfolioSeedSite): FmPayrollRosterRow[] {
  const workforceGroup = workforceGroupFromSite(site.payrollGroup);
  const sector = inferSector(site.location, site.name);

  return site.employees.map((emp) => ({
    id: emp.id,
    workforceGroup,
    epfNo: inferEpfNo(emp.empNumber, workforceGroup),
    empNumber: emp.empNumber,
    name: emp.name,
    rank: emp.rank,
    sector,
    site: primarySiteLabel(emp, site.name),
    salaryLkr: salaryFromEmployee(emp),
    earningsLkr: emp.totalGross,
    deductionsLkr: emp.totalDeductions,
    netPayLkr: emp.netTakeHome,
    payslipId: `PS-${emp.empNumber.replace(/[^A-Z0-9]/gi, '')}-202605`,
  }));
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
  { id: 'cvs_sm', label: 'CVS Sector Managers', short: 'CVS SM' },
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
