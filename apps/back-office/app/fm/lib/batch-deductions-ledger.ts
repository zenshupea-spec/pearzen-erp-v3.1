import {
  PENALTY_DEDUCTIONS_LEDGER,
  penaltyLedgerTotal,
  type PenaltyDeductionRow,
} from './penalty-deductions-ledger';

export const FM_BATCH_PERIOD = 'May 2026';

export type BatchDeductionKind = 'meals' | 'uniform' | 'advance' | 'penalty';

export type BatchDeductionRow = {
  empNo: string;
  name: string;
  rank: string;
  site: string;
  /** Deduction this month (meals/uniform/penalty) or outstanding advance balance (advance). */
  amountLkr: number;
  detail: string;
  supplier: string;
};

/** One-time mid-month salary advance — recovered in a single payroll deduction. */
function advanceDeductionRow(
  row: Omit<BatchDeductionRow, 'amountLkr' | 'detail'>,
  advanceTakenLkr: number,
  balanceRemainingLkr: number = advanceTakenLkr,
): BatchDeductionRow {
  const advanceLabel = advanceTakenLkr.toLocaleString('en-LK');
  return {
    ...row,
    detail: `One-time · LKR ${advanceLabel}`,
    amountLkr: balanceRemainingLkr,
  };
}

function penaltyRowsToBatch(rows: PenaltyDeductionRow[]): BatchDeductionRow[] {
  return rows.map((r) => ({
    empNo: r.empNo,
    name: r.name,
    rank: r.rank,
    site: r.site,
    amountLkr: r.amountLkr,
    detail: r.catalogLabel ?? r.category,
    supplier: r.supplier,
  }));
}

export const MEALS_DEDUCTIONS_LEDGER: BatchDeductionRow[] = [
  { empNo: 'G-001', name: 'Pradeep Weerasinghe', rank: 'SSO', site: 'Lanka Hospitals', amountLkr: 108_000, detail: '26 shifts', supplier: 'Serendib Hospital Catering' },
  { empNo: 'G-002', name: 'Nimal Perera', rank: 'OIC', site: 'Colombo International Airport', amountLkr: 88_000, detail: '24 shifts', supplier: 'Airport Catering Services (Pvt) Ltd' },
  { empNo: 'G-004', name: 'Ruwan Silva', rank: 'JSO', site: 'Colombo International Airport', amountLkr: 86_000, detail: '28 shifts', supplier: 'Airport Catering Services (Pvt) Ltd' },
  { empNo: 'G-008', name: 'Dulith Rathnayake', rank: 'LSO', site: 'John Keells Holdings HQ', amountLkr: 85_000, detail: '22 shifts', supplier: 'Keells Food Company PLC' },
  { empNo: 'G-012', name: 'Sunil Mendis', rank: 'JSO', site: 'John Keells Holdings HQ', amountLkr: 84_000, detail: '24 shifts', supplier: 'Keells Food Company PLC' },
  { empNo: 'G-018', name: 'Mahesh Perera', rank: 'LSO', site: 'Dialog Axiata Tower', amountLkr: 83_000, detail: '23 shifts', supplier: 'Dialog Facility Services' },
  { empNo: 'G-022', name: 'Roshan Fernando', rank: 'JSO', site: 'Hemas Hospital', amountLkr: 82_000, detail: '25 shifts', supplier: 'Hemas Meals & Hospitality' },
  { empNo: 'G-027', name: 'Chaminda Bandara', rank: 'OIC', site: 'Cargills Food City (Kandy)', amountLkr: 80_000, detail: '21 shifts', supplier: 'Cargills Ceylon PLC' },
  { empNo: 'G-033', name: 'Nuwan Jayasinghe', rank: 'LSO', site: 'Lanka Hospitals', amountLkr: 78_000, detail: '20 shifts', supplier: 'Serendib Hospital Catering' },
  { empNo: 'G-041', name: 'Lasitha Gunasekara', rank: 'JSO', site: 'Negombo Free Trade Zone', amountLkr: 76_000, detail: '19 shifts', supplier: 'Zone Catering Partners' },
];

export const UNIFORM_DEDUCTIONS_LEDGER: BatchDeductionRow[] = [
  { empNo: 'G-003', name: 'Chamara Bandara', rank: 'JSO', site: 'Lanka Hospitals', amountLkr: 59_000, detail: 'Inst. 4 of 6', supplier: 'Security Wear Lanka' },
  { empNo: 'G-005', name: 'Dinesh Fernando', rank: 'LSO', site: 'Hemas Hospital', amountLkr: 45_000, detail: 'Inst. 3 of 6', supplier: 'Uniforms Plus (Pvt) Ltd' },
  { empNo: 'G-009', name: 'Sanjeewa Bandara', rank: 'LSO', site: 'Dialog Axiata Tower', amountLkr: 43_000, detail: 'Inst. 2 of 6', supplier: 'Security Wear Lanka' },
  { empNo: 'G-015', name: 'Kasun Herath', rank: 'JSO', site: 'Colombo South — Sector pool', amountLkr: 42_000, detail: 'Inst. 5 of 6', supplier: 'Guard Apparel Co.' },
  { empNo: 'G-021', name: 'Tharaka Gunawardena', rank: 'LSO', site: 'Gampaha Distribution Centre', amountLkr: 41_000, detail: 'Inst. 1 of 6', supplier: 'Security Wear Lanka' },
  { empNo: 'G-028', name: 'Manoj Karunasena', rank: 'JSO', site: 'Kurunegala Regional Office', amountLkr: 40_000, detail: 'Inst. 3 of 6', supplier: 'Guard Apparel Co.' },
  { empNo: 'G-036', name: 'Nisith Wickrama', rank: 'LSO', site: 'Kandy City Centre', amountLkr: 39_000, detail: 'Inst. 2 of 6', supplier: 'Uniforms Plus (Pvt) Ltd' },
  { empNo: 'G-044', name: 'Lahiru Pathirana', rank: 'JSO', site: 'Negombo Free Trade Zone', amountLkr: 38_000, detail: 'Inst. 4 of 6', supplier: 'Aviation Apparel Ltd' },
  { empNo: 'G-051', name: 'Chathura Seneviratne', rank: 'LSO', site: 'Colombo International Airport', amountLkr: 37_000, detail: 'Inst. 2 of 6', supplier: 'Aviation Apparel Ltd' },
  { empNo: 'G-058', name: 'Rohan Kumarasinghe', rank: 'JSO', site: 'John Keells Holdings HQ', amountLkr: 36_000, detail: 'Inst. 6 of 6', supplier: 'Security Wear Lanka' },
];

export const ADVANCE_DEDUCTIONS_LEDGER: BatchDeductionRow[] = [
  advanceDeductionRow(
    { empNo: 'G-011', name: 'Kapila Bandara', rank: 'Security Guard', site: 'Lanka Hospitals', supplier: 'Pearzen Security (Payroll)' },
    60_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-016', name: 'Asitha Fernando', rank: 'JSO', site: 'Kurunegala Regional Office', supplier: 'Pearzen Security (Payroll)' },
    55_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-020', name: 'Priyantha Rajapaksa', rank: 'Security Officer', site: 'Lanka Hospitals', supplier: 'Pearzen Security (Payroll)' },
    50_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-025', name: 'Suresh Mendis', rank: 'OIC', site: 'Colombo International Airport', supplier: 'Pearzen Security (Payroll)' },
    45_000,
  ),
  advanceDeductionRow(
    { empNo: 'D-107', name: 'AMARASINGHE P.R.', rank: 'GARD', site: 'Kandy Regional', supplier: 'Pearzen Security (Payroll)' },
    12_000,
    12_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-030', name: 'Roshan Jayawardena', rank: 'SSO', site: 'Gampaha Distribution Centre', supplier: 'Pearzen Security (Payroll)' },
    40_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-037', name: 'Mahesh Dissanayake', rank: 'JSO', site: 'Kandy City Centre', supplier: 'Pearzen Security (Payroll)' },
    38_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-042', name: 'Chaminda Perera', rank: 'LSO', site: 'Negombo Free Trade Zone', supplier: 'Pearzen Security (Payroll)' },
    35_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-049', name: 'Dinesh Abeywickrama', rank: 'JSO', site: 'Hemas Hospital', supplier: 'Pearzen Security (Payroll)' },
    32_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-054', name: 'Prasanna Jayasinghe', rank: 'LSO', site: 'Dialog Axiata Tower', supplier: 'Pearzen Security (Payroll)' },
    30_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-063', name: 'Nuwan Fernandopulle', rank: 'JSO', site: 'Colombo South — Sector pool', supplier: 'Pearzen Security (Payroll)' },
    28_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-068', name: 'Thilak Samarawickrama', rank: 'LSO', site: 'John Keells Holdings HQ', supplier: 'Pearzen Security (Payroll)' },
    25_000,
  ),
  advanceDeductionRow(
    { empNo: 'G-075', name: 'Gayan Weerasekara', rank: 'JSO', site: 'Cargills Food City (Kandy)', supplier: 'Pearzen Security (Payroll)' },
    24_000,
  ),
];

const LEDGERS: Record<BatchDeductionKind, () => BatchDeductionRow[]> = {
  meals: () => MEALS_DEDUCTIONS_LEDGER,
  uniform: () => UNIFORM_DEDUCTIONS_LEDGER,
  advance: () => ADVANCE_DEDUCTIONS_LEDGER,
  penalty: () => penaltyRowsToBatch(PENALTY_DEDUCTIONS_LEDGER),
};

export function getDeductionLedger(kind: BatchDeductionKind): BatchDeductionRow[] {
  return LEDGERS[kind]();
}

export function deductionLedgerTotal(rows: BatchDeductionRow[]) {
  return rows.reduce((s, r) => s + r.amountLkr, 0);
}

const lkrPlain = (n: number) =>
  n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildDeductionTableHtml(kind: BatchDeductionKind, rows: BatchDeductionRow[]) {
  const meta = deductionReportMeta(kind);
  const total = deductionLedgerTotal(rows);
  const supplierCell = meta.showSupplierColumn
    ? (r: BatchDeductionRow) =>
        `<td style="font-size:9px;color:#475569;">${r.supplier}</td>`
    : () => '';
  const body = rows
    .map(
      (r) => `<tr>
        <td>${r.name}<br/><span style="color:#64748b;font-size:9px;">${r.rank}</span></td>
        <td>${r.empNo}</td>
        <td>${r.site}</td>
        <td>${r.detail}</td>
        ${supplierCell(r)}
        <td class="num">${lkrPlain(r.amountLkr)}</td>
      </tr>`,
    )
    .join('');
  const supplierHead = meta.showSupplierColumn ? '<th>Supplier</th>' : '';
  const footerColSpan = meta.showSupplierColumn ? 5 : 4;
  return {
    head: `<tr>
      <th>Employee</th><th>Emp No.</th><th>Site</th>
      <th>${meta.detailColumn}</th>${supplierHead}<th class="num">${meta.amountColumn}</th>
    </tr>`,
    body:
      body +
      `<tr>
        <td colspan="${footerColSpan}"><strong>${kind === 'advance' ? 'Total outstanding' : 'Batch total'} — ${rows.length} employees</strong></td>
        <td class="num"><strong>${lkrPlain(total)}</strong></td>
      </tr>`,
  };
}

export function deductionReportMeta(kind: BatchDeductionKind) {
  const map = {
    meals: {
      title: 'Meals Deductions Report',
      subtitle: 'Canteen & site meal recoveries',
      detailColumn: 'Shifts billed',
      amountColumn: 'Meals (LKR)',
      filenameSlug: 'meals-deductions',
      accent: 'indigo' as const,
      showSupplierColumn: true,
    },
    uniform: {
      title: 'Uniform Deductions Report',
      subtitle: 'Uniform & boot recovery schedule',
      detailColumn: 'Instalment',
      amountColumn: 'Uniform (LKR)',
      filenameSlug: 'uniform-deductions',
      accent: 'violet' as const,
      showSupplierColumn: false,
    },
    advance: {
      title: 'Advance Salary Deductions Report',
      subtitle: 'One-time salary advance recoveries',
      detailColumn: 'Advance type',
      amountColumn: 'Balance remaining (LKR)',
      filenameSlug: 'advance-deductions',
      accent: 'amber' as const,
      showSupplierColumn: false,
    },
    penalty: {
      title: 'Penalty Deductions Report',
      subtitle: 'Disciplinary fines from SM penalty catalog',
      detailColumn: 'Offense',
      amountColumn: 'Penalty (LKR)',
      filenameSlug: 'penalty-deductions',
      accent: 'rose' as const,
      showSupplierColumn: false,
    },
  };
  return map[kind];
}

export { penaltyLedgerTotal };
