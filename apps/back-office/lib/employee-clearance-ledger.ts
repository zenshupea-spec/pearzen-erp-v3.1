import {
  getDeductionLedger,
  type BatchDeductionKind,
} from '../app/fm/lib/batch-deductions-ledger';

export type UnsettledBalanceLine = {
  type: 'uniform' | 'meals' | 'advance' | 'penalty' | 'other';
  label: string;
  amountLkr: number;
  detail?: string;
  source: 'fm_ledger' | 'database';
};

export type FmRetentionSnapshot = {
  totalGrossLkr: number;
  totalDeductionsLkr: number;
  netTakeHomeLkr: number;
  prevMonthShifts?: number;
  currMonthShifts?: number;
} | null;

function normKey(value: string | number | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function nameKey(value: string | null | undefined): string {
  return normKey(value).replace(/\s+/g, ' ');
}

function ledgerRowMatches(
  row: { empNo: string; name: string },
  empNo: string | null,
  fullName: string | null,
): boolean {
  const key = normKey(empNo);
  if (key && normKey(row.empNo) === key) return true;
  const n = nameKey(fullName);
  return Boolean(n && nameKey(row.name) === n);
}

export function lookupFmUnsettledBalances(
  empNo: string | null,
  fullName: string | null,
): UnsettledBalanceLine[] {
  const lines: UnsettledBalanceLine[] = [];
  const kinds: { kind: BatchDeductionKind; type: UnsettledBalanceLine['type']; label: string }[] = [
    { kind: 'uniform', type: 'uniform', label: 'Uniform recovery' },
    { kind: 'meals', type: 'meals', label: 'Meals / canteen' },
    { kind: 'advance', type: 'advance', label: 'Salary advance' },
    { kind: 'penalty', type: 'penalty', label: 'Penalty / disciplinary' },
  ];

  for (const { kind, type, label } of kinds) {
    const row = getDeductionLedger(kind).find((r) =>
      ledgerRowMatches(r, empNo, fullName),
    );
    if (row && row.amountLkr > 0) {
      lines.push({
        type,
        label,
        amountLkr: row.amountLkr,
        detail: row.detail,
        source: 'fm_ledger',
      });
    }
  }

  return lines;
}

export function lookupFmRetentionSnapshot(
  _empNo: string | null,
  _fullName: string | null,
): FmRetentionSnapshot {
  return null;
}

/** Re-export for tests / callers that need raw ledgers */
export {
  ADVANCE_DEDUCTIONS_LEDGER,
  MEALS_DEDUCTIONS_LEDGER,
  UNIFORM_DEDUCTIONS_LEDGER,
} from '../app/fm/lib/batch-deductions-ledger';
