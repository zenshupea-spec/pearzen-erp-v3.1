/** Live penalty ledger — populated via `fetchFmPenaltyDeductionLedger` (no mock rows). */
export const FM_PENALTY_BATCH_PERIOD = 'May 2026';

export type PenaltyDeductionRow = {
  empNo: string;
  name: string;
  rank: string;
  site: string;
  amountLkr: number;
  category: 'Disciplinary' | 'Client pass-through';
  supplier: string;
  catalogLabel?: string;
};

export const PENALTY_DEDUCTIONS_LEDGER: PenaltyDeductionRow[] = [];

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
        <td>${r.catalogLabel ?? r.category}</td>
        <td style="font-size:9px;color:#475569;">${r.supplier}</td>
        <td class="num">${lkrPlain(r.amountLkr)}</td>
      </tr>`,
    )
    .join('');
  return {
    head: `<tr>
      <th>Employee</th><th>Emp No.</th><th>Site</th>
      <th>Offense</th><th>Supplier</th><th class="num">Penalty (LKR)</th>
    </tr>`,
    body:
      body +
      `<tr>
        <td colspan="5"><strong>Batch total — ${rows.length} employees</strong></td>
        <td class="num"><strong>${lkrPlain(total)}</strong></td>
      </tr>`,
  };
}
