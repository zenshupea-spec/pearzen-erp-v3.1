import { monthKeyToLabel } from './month-window';

export const AR_BANK_FEE_TOLERANCE_LKR = 300;

export type ArCreditNote = { amount: number };

export type ArClientDeduction = {
  penaltyId: string;
  incidentRef: string;
  totalClientLoss: number;
  deductionThisMonth: number;
  responsibleGuards?: { empNo: string; name: string }[];
  monthlyDeductionPerGuard?: number;
  durationMonths?: number;
  monthsCompleted?: number;
  recoveredToDate?: number;
  omNote?: string;
  liabilityType?: 'PASS_TO_GUARD' | 'COMPANY_ABSORBS';
};

export type ArCollectionCell = {
  status: string;
  totalAmount: number;
  amountReceived?: number | null;
  creditNotes?: ArCreditNote[];
  clientDeductions?: ArClientDeduction[];
  rolloverDebt?: number;
  rolloverFromMonth?: string;
};

export type ArCollectionClientRecord = {
  clientId: string;
  clientName: string;
  sector: string;
  invoices: Record<string, ArCollectionCell & Record<string, unknown>>;
};

export function sumCreditNotes(cell: Pick<ArCollectionCell, 'creditNotes'>): number {
  return ((cell.creditNotes as ArCreditNote[] | undefined) ?? []).reduce(
    (sum, note) => sum + Number(note.amount ?? 0),
    0,
  );
}

export function sumClientDeductions(cell: Pick<ArCollectionCell, 'clientDeductions'>): number {
  return ((cell.clientDeductions as ArClientDeduction[] | undefined) ?? []).reduce(
    (sum, row) => sum + Number(row.deductionThisMonth ?? 0),
    0,
  );
}

export type ArRankLineForTotal = {
  headcount: number;
  shiftsPerHead: number;
  ratePerShift: number;
};

export type ArPatrolForTotal = { charge: number };

export type ArCellForTotal = Pick<ArCollectionCell, 'clientDeductions' | 'totalAmount'> & {
  rankLines?: ArRankLineForTotal[];
  patrols?: ArPatrolForTotal[];
};

export function rankSubtotal(lines: ArRankLineForTotal[]): number {
  return lines.reduce((sum, line) => sum + line.headcount * line.shiftsPerHead * line.ratePerShift, 0);
}

export function patrolSubtotal(patrols: ArPatrolForTotal[]): number {
  return patrols.reduce((sum, patrol) => sum + patrol.charge, 0);
}

/** Invoice total = rank shifts + patrol visits − client penalty deductions this month. */
export function recomputeCellTotalAmount(cell: ArCellForTotal): number {
  const gross = rankSubtotal(cell.rankLines ?? []) + patrolSubtotal(cell.patrols ?? []);
  return Math.max(0, gross - sumClientDeductions(cell));
}

export function normalizeLedgerCellTotals<T extends ArCollectionClientRecord>(
  clients: T[],
): T[] {
  return clients.map((client) => {
    let changed = false;
    const invoices: T['invoices'] = { ...client.invoices };

    for (const [monthKey, cell] of Object.entries(client.invoices)) {
      if (!cell || cell.status === 'NONE') continue;
      const hasLines = (cell.rankLines?.length ?? 0) > 0 || (cell.patrols?.length ?? 0) > 0;
      if (!hasLines) continue;

      const nextTotal = recomputeCellTotalAmount(cell);
      if (Math.abs(nextTotal - cell.totalAmount) > 0.01) {
        invoices[monthKey] = { ...cell, totalAmount: nextTotal };
        changed = true;
      }
    }

    return changed ? { ...client, invoices } : client;
  });
}

export function assertLedgerCellTotals(clients: ArCollectionClientRecord[]): void {
  if (process.env.NODE_ENV === 'production') return;

  for (const client of clients) {
    for (const [monthKey, cell] of Object.entries(client.invoices)) {
      if (!cell || cell.status === 'NONE') continue;
      const hasLines = (cell.rankLines?.length ?? 0) > 0 || (cell.patrols?.length ?? 0) > 0;
      if (!hasLines) continue;

      const expected = recomputeCellTotalAmount(cell);
      if (Math.abs(expected - cell.totalAmount) > 0.01) {
        console.warn(
          `[AR] totalAmount mismatch for ${client.clientName} ${monthKey}: expected ${expected}, got ${cell.totalAmount}`,
        );
      }
    }
  }
}

/** Shortfall on a PARTIAL invoice eligible to roll into the next month (300 LKR tolerance). */
export function partialRolloverShortfall(cell: ArCollectionCell): number {
  if (cell.status !== 'PARTIAL' || cell.amountReceived == null) return 0;
  const raw = cell.totalAmount - cell.amountReceived - sumCreditNotes(cell);
  return raw <= AR_BANK_FEE_TOLERANCE_LKR ? 0 : Math.max(0, raw);
}

export function effectiveRolloverDebt(
  cell: ArCollectionCell,
  priorPartialCell: ArCollectionCell | undefined,
): number {
  if (cell.rolloverFromMonth && priorPartialCell?.status === 'PARTIAL') {
    return partialRolloverShortfall(priorPartialCell);
  }
  return cell.rolloverDebt ?? 0;
}

/** Amount the client still owes before MD settlement (includes rollover, excludes deductions). */
export function invoiceNetDue(
  cell: ArCollectionCell,
  priorPartialCell?: ArCollectionCell,
): number {
  const rollover = effectiveRolloverDebt(cell, priorPartialCell);
  return Math.max(0, cell.totalAmount + rollover - sumCreditNotes(cell));
}

/** Remaining shortfall after MD-entered receipt against net due. */
export function mdSettlementShortfall(
  cell: ArCollectionCell,
  amountReceived: number,
  priorPartialCell?: ArCollectionCell,
): number {
  return Math.max(0, invoiceNetDue(cell, priorPartialCell) - amountReceived);
}

export function canMarkPaidWithinTolerance(shortfallLkr: number): boolean {
  return shortfallLkr <= AR_BANK_FEE_TOLERANCE_LKR;
}

export function canAcceptPartialPayment(
  shortfallLkr: number,
  deductionTotalLkr: number,
): boolean {
  return (
    shortfallLkr > AR_BANK_FEE_TOLERANCE_LKR &&
    !canSettleWithFines(shortfallLkr, deductionTotalLkr)
  );
}

export function canSettleWithFines(
  shortfallLkr: number,
  deductionTotalLkr: number,
): boolean {
  return (
    shortfallLkr > AR_BANK_FEE_TOLERANCE_LKR &&
    deductionTotalLkr > 0 &&
    Math.abs(shortfallLkr - deductionTotalLkr) <= AR_BANK_FEE_TOLERANCE_LKR
  );
}

export function invoiceOutstandingBalance(
  cell: ArCollectionCell,
  priorPartialCell?: ArCollectionCell,
): number {
  if (cell.status === 'NONE' || cell.status === 'PAID') return 0;
  const netDue = invoiceNetDue(cell, priorPartialCell);
  if (cell.status === 'PARTIAL' || cell.status === 'SETTLED_FINED') {
    return Math.max(0, netDue - (cell.amountReceived ?? 0));
  }
  return netDue;
}

export function stripComputedRollovers<T extends ArCollectionClientRecord>(clients: T[]): T[] {
  return clients.map((client) => ({
    ...client,
    invoices: Object.fromEntries(
      Object.entries(client.invoices ?? {}).map(([monthKey, cell]) => {
        if (!cell) return [monthKey, cell];
        const { rolloverDebt: _debt, rolloverFromMonth: _from, ...rest } = cell;
        return [monthKey, rest];
      }),
    ),
  })) as T[];
}

export function applyRolloverDebts<T extends ArCollectionClientRecord>(
  clients: T[],
  chronoKeys: string[],
): T[] {
  return clients.map((client) => {
    let invoices = { ...client.invoices };
    for (const monthKey of chronoKeys) {
      const cell = invoices[monthKey];
      if (!cell || cell.status !== 'PARTIAL' || cell.amountReceived == null) continue;
      const nextKey = chronoKeys[chronoKeys.indexOf(monthKey) + 1];
      if (!nextKey) continue;
      const shortfall = partialRolloverShortfall(cell);
      const next = invoices[nextKey];
      if (!next || next.status === 'NONE') continue;
      if (shortfall > 0) {
        invoices = {
          ...invoices,
          [nextKey]: {
            ...next,
            rolloverDebt: shortfall,
            rolloverFromMonth: monthKeyToLabel(monthKey),
          },
        };
      }
    }
    return { ...client, invoices };
  }) as T[];
}

export function validatePaymentCollectionAmounts(
  change: {
    toStatus: string;
    after: ArCollectionCell;
    before: ArCollectionCell;
    clientName: string;
    monthKey: string;
  },
  priorPartialCell?: ArCollectionCell,
): { ok: true } | { ok: false; error: string } {
  const label = `${change.clientName} ${change.monthKey}`;
  const received = change.after.amountReceived ?? change.before.amountReceived;
  if (change.toStatus === 'PAID' && (received == null || received <= 0)) {
    return { ok: true };
  }
  if (received == null || received <= 0) {
    if (change.toStatus === 'PARTIAL' || change.toStatus === 'SETTLED_FINED') {
      return { ok: false, error: `${label}: verified amount is required.` };
    }
    return { ok: true };
  }

  const shortfall = mdSettlementShortfall(change.after, received, priorPartialCell);
  const deductionTotal = sumClientDeductions(change.after);

  if (change.toStatus === 'PAID' && shortfall > AR_BANK_FEE_TOLERANCE_LKR) {
    return {
      ok: false,
      error: `${label}: paid in full requires shortfall within ${AR_BANK_FEE_TOLERANCE_LKR} LKR.`,
    };
  }

  if (change.toStatus === 'PARTIAL') {
    if (!canAcceptPartialPayment(shortfall, deductionTotal)) {
      return {
        ok: false,
        error: `${label}: partial payment requires shortfall above bank fee tolerance.`,
      };
    }
  }

  if (change.toStatus === 'SETTLED_FINED') {
    if (!canSettleWithFines(shortfall, deductionTotal)) {
      return {
        ok: false,
        error: `${label}: settled-with-fines must match client deductions within tolerance.`,
      };
    }
  }

  return { ok: true };
}
