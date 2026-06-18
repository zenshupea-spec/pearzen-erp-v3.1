import {
  calcApit,
  calcApitBySlab,
  DEFAULT_APIT_SLABS,
  DEFAULT_STAMP_DUTY_LKR,
  formatApitSlabLabel,
  getMarginalApitSlab,
  type ApitSlab,
} from '../../../../../packages/payroll-deductions';
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

export function calculateEmployeeStatutory(
  gross: number,
  slabs: ApitSlab[] = DEFAULT_APIT_SLABS,
) {
  const epf = gross * 0.08;
  const etf = gross * 0.03;
  const apit = calcApit(gross, slabs);
  const stamp = gross >= 30_000 ? DEFAULT_STAMP_DUTY_LKR : 0;
  return { epf, etf, apit, stamp, total: epf + etf + apit + stamp };
}

export type StatutoryApitBracketSummary = {
  slab: ApitSlab;
  label: string;
  employeeCount: number;
  totalApit: number;
};

export type StatutoryApitEmployeeRow = {
  employee: FmReportEmployee;
  gross: number;
  apit: number;
  marginalSlab: ApitSlab;
};

export function buildStatutoryApitReport(
  employees: FmReportEmployee[],
  slabs: ApitSlab[] = DEFAULT_APIT_SLABS,
) {
  const bracketTotals = new Map<
    number,
    { slab: ApitSlab; totalApit: number; employeeIds: Set<string> }
  >();
  for (const slab of slabs) {
    if (slab.rate <= 0) continue;
    bracketTotals.set(slab.id, { slab, totalApit: 0, employeeIds: new Set() });
  }

  const apitEmployees: StatutoryApitEmployeeRow[] = [];

  for (const emp of employees) {
    const apit = calcApit(emp.totalGross, slabs);
    if (apit > 0) {
      apitEmployees.push({
        employee: emp,
        gross: emp.totalGross,
        apit,
        marginalSlab: getMarginalApitSlab(emp.totalGross, slabs),
      });
    }
    for (const { slab, amount } of calcApitBySlab(emp.totalGross, slabs)) {
      const entry = bracketTotals.get(slab.id);
      if (!entry || amount <= 0) continue;
      entry.totalApit += amount;
      entry.employeeIds.add(emp.id);
    }
  }

  const bracketSummary: StatutoryApitBracketSummary[] = [...bracketTotals.values()]
    .sort((a, b) => a.slab.min - b.slab.min)
    .map((entry) => ({
      slab: entry.slab,
      label: formatApitSlabLabel(entry.slab),
      employeeCount: entry.employeeIds.size,
      totalApit: entry.totalApit,
    }));

  const employeesByBracket = new Map<number, StatutoryApitEmployeeRow[]>();
  for (const row of apitEmployees) {
    const list = employeesByBracket.get(row.marginalSlab.id) ?? [];
    list.push(row);
    employeesByBracket.set(row.marginalSlab.id, list);
  }
  for (const list of employeesByBracket.values()) {
    list.sort((a, b) => a.employee.name.localeCompare(b.employee.name, undefined, { sensitivity: 'base' }));
  }

  return { bracketSummary, employeesByBracket, apitEmployees };
}

export { formatApitSlabLabel };

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
): { head: string; body: string; contentHtml?: string } {
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
    return {
      head: '',
      body: '',
      contentHtml: buildStatutoryReportContentHtml(employees),
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

function employeeNameCellHtml(e: FmReportEmployee) {
  return `${e.name}<br/><span style="color:#64748b;font-size:9px;">${e.empNumber}</span>`;
}

export function buildStatutoryReportContentHtml(employees: FmReportEmployee[]): string {
  const apitReport = buildStatutoryApitReport(employees);
  let epfTotal = 0;
  let etfTotal = 0;
  let stampTotal = 0;
  let portfolioTotal = 0;

  const epfRows = employees
    .map((e) => {
      const s = calculateEmployeeStatutory(e.totalGross);
      epfTotal += s.epf;
      etfTotal += s.etf;
      stampTotal += s.stamp;
      portfolioTotal += s.total;
      return `<tr>
        <td>${employeeNameCellHtml(e)}</td>
        <td>${e.siteName ?? '—'}</td>
        <td class="num">${lkrPlain(s.epf)}</td>
        <td class="num">${lkrPlain(s.etf)}</td>
        <td class="num">${lkrPlain(s.stamp)}</td>
        <td class="num"><strong>${lkrPlain(s.epf + s.etf + s.stamp)}</strong></td>
      </tr>`;
    })
    .join('');

  const bracketRows =
    apitReport.bracketSummary.length > 0
      ? apitReport.bracketSummary
          .map(
            (row) => `<tr>
          <td>${row.label}</td>
          <td class="num">${row.slab.rate}%</td>
          <td class="num">${row.employeeCount}</td>
          <td class="num"><strong>${lkrPlain(row.totalApit)}</strong></td>
        </tr>`,
          )
          .join('')
      : `<tr><td colspan="4">No APIT liability in any bracket this period.</td></tr>`;

  const apitTotal = apitReport.bracketSummary.reduce((sum, row) => sum + row.totalApit, 0);
  const bracketRowsWithTotal =
    bracketRows +
    (apitTotal > 0
      ? `<tr><td colspan="3"><strong>Portfolio APIT Total</strong></td>
          <td class="num"><strong>${lkrPlain(apitTotal)}</strong></td></tr>`
      : '');

  const employeeSections =
    apitReport.apitEmployees.length === 0
      ? `<p style="margin-top:8px;color:#64748b;">No employees liable for APIT this period.</p>`
      : apitReport.bracketSummary
          .filter((row) => (apitReport.employeesByBracket.get(row.slab.id)?.length ?? 0) > 0)
          .map((row) => {
            const rows = apitReport.employeesByBracket.get(row.slab.id) ?? [];
            const body = rows
              .map(
                (entry) => `<tr>
              <td>${employeeNameCellHtml(entry.employee)}</td>
              <td>${entry.employee.siteName ?? '—'}</td>
              <td class="num">${lkrPlain(entry.gross)}</td>
              <td class="num"><strong>${lkrPlain(entry.apit)}</strong></td>
            </tr>`,
              )
              .join('');
            return `<h3 style="margin:16px 0 8px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#475569;">${row.label}</h3>
            <table>
              <thead><tr>
                <th>Employee</th><th>Site</th>
                <th class="num">Gross Salary</th><th class="num">APIT</th>
              </tr></thead>
              <tbody>${body}</tbody>
            </table>`;
          })
          .join('');

  return `
    <h2 style="margin:0 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">EPF · ETF · Stamp Duty</h2>
    <table>
      <thead><tr>
        <th>Employee</th><th>Site</th>
        <th class="num">EPF (8%)</th><th class="num">ETF (3%)</th>
        <th class="num">Stamp</th><th class="num">Subtotal</th>
      </tr></thead>
      <tbody>
        ${epfRows}
        <tr><td colspan="2"><strong>Portfolio Subtotal</strong></td>
          <td class="num"><strong>${lkrPlain(epfTotal)}</strong></td>
          <td class="num"><strong>${lkrPlain(etfTotal)}</strong></td>
          <td class="num"><strong>${lkrPlain(stampTotal)}</strong></td>
          <td class="num"><strong>${lkrPlain(epfTotal + etfTotal + stampTotal)}</strong></td></tr>
      </tbody>
    </table>

    <h2 style="margin:20px 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">APIT — Bracket Summary</h2>
    <table>
      <thead><tr>
        <th>Bracket</th><th class="num">Rate</th>
        <th class="num">Employees</th><th class="num">Total APIT</th>
      </tr></thead>
      <tbody>${bracketRowsWithTotal}</tbody>
    </table>

    <h2 style="margin:20px 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;">APIT — Paying Employees by Bracket</h2>
    ${employeeSections}

    <table style="margin-top:20px;">
      <tbody><tr>
        <td><strong>Portfolio Statutory Total (EPF + ETF + Stamp + APIT)</strong></td>
        <td class="num"><strong>${lkrPlain(portfolioTotal)}</strong></td>
      </tr></tbody>
    </table>`;
}

export { lkr };
