import {
  FM_PREV_MONTH_STOP_LIST,
  FM_SALARY_MONTH_HALF_HOLD_LIST,
  type RetentionGuardRow,
} from './retention-lists';
import { FM_LIVE_PAYROLL_PERIOD, formatPayrollPeriodLabel } from './payroll-period';

export type FmPortfolioReportKind =
  | 'payroll-cost'
  | 'client-billing'
  | 'statutory'
  | 'deductions'
  | 'stop-list'
  | 'half-hold';

export const FM_PAYROLL_PERIOD_LABEL = formatPayrollPeriodLabel(FM_LIVE_PAYROLL_PERIOD);

export type FmReportEmployee = {
  id: string;
  empNumber: string;
  name: string;
  rank: string;
  siteName?: string;
  shiftsAtSite: number;
  totalGross: number;
  totalDeductions: number;
  netTakeHome: number;
  deductions: {
    type: 'Meals' | 'Uniform' | 'Penalty' | 'Advance';
    thisMonthAmount: number;
  }[];
};

export type FmReportSite = {
  id: string;
  name: string;
  location: string;
  clientBilled: number;
  payrollCost: number;
  employees: Omit<FmReportEmployee, 'siteName'>[];
};

const lkr = (n: number) =>
  'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const lkrPlain = (n: number) => n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function flattenPortfolioEmployees(sites: FmReportSite[]): FmReportEmployee[] {
  return sites.flatMap((site) =>
    site.employees.map((emp) => ({ ...emp, siteName: site.name })),
  );
}

export function sumDeductionByType(
  employees: FmReportEmployee[],
  type: FmReportEmployee['deductions'][number]['type'],
) {
  return employees.reduce(
    (sum, emp) =>
      sum + emp.deductions.filter((d) => d.type === type).reduce((s, d) => s + d.thisMonthAmount, 0),
    0,
  );
}

export function calculateEmployeeStatutory(gross: number) {
  const epf = gross * 0.08;
  const etf = gross * 0.03;
  const apit = gross * 0.02;
  const stamp = gross >= 30_000 ? 25 : 0;
  return { epf, etf, apit, stamp, total: epf + etf + apit + stamp };
}

/** Mock AR collection lines aligned to portfolio sites. */
const CLIENT_BILLING_COLLECTION: Record<
  string,
  { paidDate: string; paidAmount: number; clientDeductions: number }
> = {
  'site-001': { paidDate: '28 May 2026', paidAmount: 1_100_000, clientDeductions: 42_500 },
  'site-002': { paidDate: '26 May 2026', paidAmount: 1_380_000, clientDeductions: 68_000 },
  'site-003': { paidDate: '30 May 2026', paidAmount: 1_420_000, clientDeductions: 95_000 },
  'site-004': { paidDate: '22 May 2026', paidAmount: 580_000, clientDeductions: 18_000 },
  'site-005': { paidDate: '27 May 2026', paidAmount: 900_000, clientDeductions: 35_000 },
};

export function buildClientBillingRows(sites: FmReportSite[]) {
  return sites.map((site) => {
    const collection = CLIENT_BILLING_COLLECTION[site.id] ?? {
      paidDate: '—',
      paidAmount: 0,
      clientDeductions: 0,
    };
    const netProfit = site.clientBilled - site.payrollCost - collection.clientDeductions;
    return {
      siteName: site.name,
      invoiceAmount: site.clientBilled,
      paidDate: collection.paidDate,
      paidAmount: collection.paidAmount,
      clientDeductions: collection.clientDeductions,
      payrollCost: site.payrollCost,
      netProfit,
    };
  });
}

export function reportMeta(kind: FmPortfolioReportKind): { title: string; subtitle: string } {
  const map: Record<FmPortfolioReportKind, { title: string; subtitle: string }> = {
    'payroll-cost': {
      title: 'Portfolio Payroll Cost Report',
      subtitle: 'All employees — gross salary by person',
    },
    'client-billing': {
      title: 'Portfolio Client Billing Report',
      subtitle: 'Invoice, collections, deductions & site net',
    },
    statutory: {
      title: 'Portfolio Statutory Cost Report',
      subtitle: 'EPF · ETF · APIT · Stamp Duty by employee',
    },
    deductions: {
      title: 'Reconciled Deductions Report',
      subtitle: 'Meals · Uniform · Advances · Penalties',
    },
    'stop-list': {
      title: 'Active Stop List — Previous Month Threshold',
      subtitle: 'Payment halted — Apr 2026 shifts below threshold',
    },
    'half-hold': {
      title: 'Half Salary Hold — Salary Month Threshold',
      subtitle: 'Half salary only — May shifts below threshold',
    },
  };
  return map[kind];
}

export function requiresMdApprovalForExport(kind: FmPortfolioReportKind) {
  return kind !== 'client-billing';
}

export function buildTableHtml(
  kind: FmPortfolioReportKind,
  sites: FmReportSite[],
): { head: string; body: string } {
  const employees = flattenPortfolioEmployees(sites);

  if (kind === 'payroll-cost') {
    const totalGross = employees.reduce((s, e) => s + e.totalGross, 0);
    return {
      head: `<tr>
        <th>Employee</th><th>Emp No.</th><th>Site</th><th class="num">Gross Salary</th>
        <th class="num">Deductions</th><th class="num">Net Take-Home</th>
      </tr>`,
      body:
        employees
          .map(
            (e) => `<tr>
          <td>${e.name}<br/><span style="color:#64748b;font-size:9px;">${e.rank}</span></td>
          <td>${e.empNumber}</td><td>${e.siteName}</td>
          <td class="num">${lkrPlain(e.totalGross)}</td>
          <td class="num">${lkrPlain(e.totalDeductions)}</td>
          <td class="num">${lkrPlain(e.netTakeHome)}</td>
        </tr>`,
          )
          .join('') +
        `<tr><td colspan="3"><strong>Portfolio Total</strong></td>
          <td class="num"><strong>${lkrPlain(totalGross)}</strong></td>
          <td class="num">—</td>
          <td class="num">—</td></tr>`,
    };
  }

  if (kind === 'client-billing') {
    const rows = buildClientBillingRows(sites);
    const totalNet = rows.reduce((s, r) => s + r.netProfit, 0);
    return {
      head: `<tr>
        <th>Client / Site</th><th class="num">Invoice</th><th>Paid Date</th>
        <th class="num">Paid Amount</th><th class="num">Client Deductions</th>
        <th class="num">Payroll Cost</th><th class="num">Site Net P/L</th>
      </tr>`,
      body:
        rows
          .map(
            (r) => `<tr>
          <td>${r.siteName}</td>
          <td class="num">${lkrPlain(r.invoiceAmount)}</td>
          <td>${r.paidDate}</td>
          <td class="num">${lkrPlain(r.paidAmount)}</td>
          <td class="num">${lkrPlain(r.clientDeductions)}</td>
          <td class="num">${lkrPlain(r.payrollCost)}</td>
          <td class="num" style="color:${r.netProfit >= 0 ? '#047857' : '#b91c1c'}">${lkrPlain(r.netProfit)}</td>
        </tr>`,
          )
          .join('') +
        `<tr><td colspan="6"><strong>Portfolio Net</strong></td>
          <td class="num"><strong>${lkrPlain(totalNet)}</strong></td></tr>`,
    };
  }

  if (kind === 'statutory') {
    let total = 0;
    const bodyRows = employees
      .map((e) => {
        const s = calculateEmployeeStatutory(e.totalGross);
        total += s.total;
        return `<tr>
          <td>${e.name}</td><td>${e.empNumber}</td><td>${e.siteName}</td>
          <td class="num">${lkrPlain(s.epf)}</td><td class="num">${lkrPlain(s.etf)}</td>
          <td class="num">${lkrPlain(s.apit)}</td><td class="num">${lkrPlain(s.stamp)}</td>
          <td class="num"><strong>${lkrPlain(s.total)}</strong></td>
        </tr>`;
      })
      .join('');
    return {
      head: `<tr>
        <th>Employee</th><th>Emp No.</th><th>Site</th>
        <th class="num">EPF (8%)</th><th class="num">ETF (3%)</th>
        <th class="num">APIT</th><th class="num">Stamp</th><th class="num">Total</th>
      </tr>`,
      body:
        bodyRows +
        `<tr><td colspan="7"><strong>Portfolio Statutory Total</strong></td>
          <td class="num"><strong>${lkrPlain(total)}</strong></td></tr>`,
    };
  }

  if (kind === 'deductions') {
    const bodyRows = employees
      .map((e) => {
        const meals = sumEmpDeduction(e, 'Meals');
        const uniform = sumEmpDeduction(e, 'Uniform');
        const advances = sumEmpDeduction(e, 'Advance');
        const penalties = sumEmpDeduction(e, 'Penalty');
        return `<tr>
          <td>${e.name}</td><td>${e.empNumber}</td><td>${e.siteName}</td>
          <td class="num">${lkrPlain(meals)}</td><td class="num">${lkrPlain(uniform)}</td>
          <td class="num">${lkrPlain(advances)}</td><td class="num">${lkrPlain(penalties)}</td>
          <td class="num"><strong>${lkrPlain(e.totalDeductions)}</strong></td>
        </tr>`;
      })
      .join('');
    return {
      head: `<tr>
        <th>Employee</th><th>Emp No.</th><th>Site</th>
        <th class="num">Meals</th><th class="num">Uniform</th>
        <th class="num">Advances</th><th class="num">Penalties</th><th class="num">Total</th>
      </tr>`,
      body: bodyRows,
    };
  }

  const retentionRows: RetentionGuardRow[] =
    kind === 'stop-list' ? [...FM_PREV_MONTH_STOP_LIST] : [...FM_SALARY_MONTH_HALF_HOLD_LIST];

  return {
    head: `<tr>
      <th>Employee</th><th>Emp No.</th><th class="num">Shifts Here</th>
      <th class="num">Total Gross</th><th class="num">Total Deductions</th><th class="num">Net Take-Home</th>
    </tr>`,
    body: retentionRows
      .map(
        (g) => `<tr>
        <td>${g.name}</td><td>${g.empNo}</td>
        <td class="num">${g.shiftsHere}</td>
        <td class="num">${lkrPlain(g.totalGross)}</td>
        <td class="num">${lkrPlain(g.totalDeductions)}</td>
        <td class="num">${lkrPlain(g.netTakeHome)}</td>
      </tr>`,
      )
      .join(''),
  };
}

function sumEmpDeduction(emp: FmReportEmployee, type: FmReportEmployee['deductions'][number]['type']) {
  return emp.deductions.filter((d) => d.type === type).reduce((s, d) => s + d.thisMonthAmount, 0);
}

export { lkr };
