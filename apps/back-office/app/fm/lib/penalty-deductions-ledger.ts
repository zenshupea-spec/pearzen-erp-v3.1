/** May 2026 batch — penalty ledger (mock until payroll API is wired). */
export const FM_PENALTY_BATCH_PERIOD = 'May 2026';

export type PenaltyDeductionRow = {
  empNo: string;
  name: string;
  rank: string;
  site: string;
  amountLkr: number;
  category: 'Disciplinary' | 'Client pass-through';
  supplier: string;
};

export const PENALTY_DEDUCTIONS_LEDGER: PenaltyDeductionRow[] = [
  {
    empNo: 'G-001',
    name: 'Pradeep Weerasinghe',
    rank: 'SSO',
    site: 'Lanka Hospitals',
    amountLkr: 36_500,
    category: 'Client pass-through',
    supplier: 'Arpico Supercentre',
  },
  {
    empNo: 'G-004',
    name: 'Ruwan Silva',
    rank: 'JSO',
    site: 'Colombo International Airport',
    amountLkr: 26_000,
    category: 'Disciplinary',
    supplier: 'Pearzen Security',
  },
  {
    empNo: 'G-012',
    name: 'Sunil Mendis',
    rank: 'JSO',
    site: 'John Keells Holdings HQ',
    amountLkr: 28_500,
    category: 'Client pass-through',
    supplier: 'John Keells Holdings PLC',
  },
  {
    empNo: 'G-018',
    name: 'Mahesh Perera',
    rank: 'LSO',
    site: 'Dialog Axiata Tower',
    amountLkr: 24_000,
    category: 'Disciplinary',
    supplier: 'Pearzen Security',
  },
  {
    empNo: 'G-022',
    name: 'Roshan Fernando',
    rank: 'JSO',
    site: 'Hemas Hospital',
    amountLkr: 22_000,
    category: 'Client pass-through',
    supplier: 'Hemas Holdings PLC',
  },
  {
    empNo: 'G-027',
    name: 'Chaminda Bandara',
    rank: 'OIC',
    site: 'Cargills Food City (Kandy)',
    amountLkr: 18_500,
    category: 'Disciplinary',
    supplier: 'Pearzen Security',
  },
  {
    empNo: 'G-033',
    name: 'Nuwan Jayasinghe',
    rank: 'LSO',
    site: 'Lanka Hospitals',
    amountLkr: 15_200,
    category: 'Client pass-through',
    supplier: 'Lanka Hospitals Ltd',
  },
  {
    empNo: 'G-041',
    name: 'Lasitha Gunasekara',
    rank: 'JSO',
    site: 'Negombo Free Trade Zone',
    amountLkr: 12_800,
    category: 'Disciplinary',
    supplier: 'Pearzen Security',
  },
  {
    empNo: 'G-048',
    name: 'Tharindu Wickramasinghe',
    rank: 'LSO',
    site: 'Colombo South — Sector pool',
    amountLkr: 11_200,
    category: 'Disciplinary',
    supplier: 'Pearzen Security',
  },
  {
    empNo: 'G-055',
    name: 'Dilshan Abeysekera',
    rank: 'JSO',
    site: 'Gampaha Distribution Centre',
    amountLkr: 9_800,
    category: 'Client pass-through',
    supplier: 'Gampaha Distribution Centre',
  },
  {
    empNo: 'G-062',
    name: 'Isuru Ratnayake',
    rank: 'LSO',
    site: 'Kurunegala Regional Office',
    amountLkr: 8_500,
    category: 'Disciplinary',
    supplier: 'Pearzen Security',
  },
  {
    empNo: 'G-071',
    name: 'Gayan Weerasekara',
    rank: 'JSO',
    site: 'Kandy City Centre',
    amountLkr: 7_200,
    category: 'Disciplinary',
    supplier: 'Pearzen Security',
  },
  {
    empNo: 'G-079',
    name: 'Saman Kumara',
    rank: 'LSO',
    site: 'Colombo International Airport',
    amountLkr: 5_500,
    category: 'Client pass-through',
    supplier: 'Airport & Aviation Services (Sri Lanka) Ltd',
  },
  {
    empNo: 'G-086',
    name: 'Ravindu Kotelawala',
    rank: 'JSO',
    site: 'Dialog Axiata Tower',
    amountLkr: 4_300,
    category: 'Disciplinary',
    supplier: 'Pearzen Security',
  },
];

export function penaltyLedgerTotal(rows: PenaltyDeductionRow[] = PENALTY_DEDUCTIONS_LEDGER) {
  return rows.reduce((s, r) => s + r.amountLkr, 0);
}

const lkrPlain = (n: number) =>
  n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildPenaltyDeductionsTableHtml(rows: PenaltyDeductionRow[] = PENALTY_DEDUCTIONS_LEDGER) {
  const total = penaltyLedgerTotal(rows);
  const body = rows
    .map(
      (r) => `<tr>
        <td>${r.name}<br/><span style="color:#64748b;font-size:9px;">${r.rank}</span></td>
        <td>${r.empNo}</td>
        <td>${r.site}</td>
        <td>${r.category}</td>
        <td style="font-size:9px;color:#475569;">${r.supplier}</td>
        <td class="num">${lkrPlain(r.amountLkr)}</td>
      </tr>`,
    )
    .join('');
  return {
    head: `<tr>
      <th>Employee</th><th>Emp No.</th><th>Site</th>
      <th>Category</th><th>Supplier</th><th class="num">Penalty (LKR)</th>
    </tr>`,
    body:
      body +
      `<tr>
        <td colspan="5"><strong>Batch total — ${rows.length} employees</strong></td>
        <td class="num"><strong>${lkrPlain(total)}</strong></td>
      </tr>`,
  };
}
