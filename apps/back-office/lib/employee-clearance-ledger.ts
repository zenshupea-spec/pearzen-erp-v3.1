import {
  ADVANCE_DEDUCTIONS_LEDGER,
  MEALS_DEDUCTIONS_LEDGER,
  UNIFORM_DEDUCTIONS_LEDGER,
  getDeductionLedger,
  type BatchDeductionKind,
} from '../app/fm/lib/batch-deductions-ledger';
import {
  FM_PREV_MONTH_STOP_LIST,
  FM_SALARY_MONTH_HALF_HOLD_LIST,
} from '../app/fm/lib/retention-lists';

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
  empNo: string | null,
  fullName: string | null,
): FmRetentionSnapshot {
  const key = normKey(empNo);
  const stop = FM_PREV_MONTH_STOP_LIST.find(
    (r) => normKey(r.empNo) === key || nameKey(r.name) === nameKey(fullName),
  );
  if (stop) {
    return {
      totalGrossLkr: stop.totalGross,
      totalDeductionsLkr: stop.totalDeductions,
      netTakeHomeLkr: stop.netTakeHome,
      prevMonthShifts: stop.prevShifts,
      currMonthShifts: stop.shiftsHere,
    };
  }

  const half = FM_SALARY_MONTH_HALF_HOLD_LIST.find(
    (r) => normKey(r.empNo) === key || nameKey(r.name) === nameKey(fullName),
  );
  if (half) {
    return {
      totalGrossLkr: half.totalGross,
      totalDeductionsLkr: half.totalDeductions,
      netTakeHomeLkr: half.netTakeHome,
      currMonthShifts: half.mayShifts,
      prevMonthShifts: undefined,
    };
  }

  return null;
}

/** Re-export for tests / callers that need raw ledgers */
export { MEALS_DEDUCTIONS_LEDGER, UNIFORM_DEDUCTIONS_LEDGER, ADVANCE_DEDUCTIONS_LEDGER };
