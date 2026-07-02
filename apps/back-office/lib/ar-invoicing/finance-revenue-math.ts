import { GUARD_RANK_KEYS } from '../guard-site-pay';
import {
  patrolSubtotal,
  rankSubtotal,
  sumClientDeductions,
} from './collection-math';
import type { ArLedgerClientRecord } from './live-ledger';

export type LiveArMonthRevenue = {
  totalInvoiced: number;
  rankInvoicing: number;
  visitCharges: number;
  clientDeductions: number;
  cashReceived: number;
  disputedInMonth: boolean;
};

/** Contracted monthly billing target from rank matrix qty × rate × 26 (ignores `_shiftRows`). */
export function estimateSiteMonthlyTarget(rateMatrix: unknown, requiredGuards: number): number {
  const matrix = (rateMatrix ?? {}) as Record<string, { invoiceRate?: number; qty?: number } | number>;
  let total = 0;

  for (const [key, entry] of Object.entries(matrix)) {
    if (key.startsWith('_') || !GUARD_RANK_KEYS.includes(key as (typeof GUARD_RANK_KEYS)[number])) {
      continue;
    }
    if (typeof entry === 'number') {
      total += entry * 26;
      continue;
    }
    const rate = Number(entry?.invoiceRate ?? 0);
    const qty = Number(entry?.qty ?? requiredGuards ?? 1);
    if (!Number.isFinite(rate) || !Number.isFinite(qty)) continue;
    total += rate * qty * 26;
  }

  return total;
}

export function sumLiveArMonthRevenue(
  clients: ArLedgerClientRecord[],
  monthKey: string,
): LiveArMonthRevenue {
  let totalInvoiced = 0;
  let rankInvoicing = 0;
  let visitCharges = 0;
  let clientDeductions = 0;
  let cashReceived = 0;
  let disputedInMonth = false;

  for (const client of clients) {
    const cell = client.invoices[monthKey];
    if (!cell || cell.status === 'NONE') continue;

    if (cell.status === 'DISPUTED') disputedInMonth = true;

    totalInvoiced += Number(cell.totalAmount ?? 0);
    rankInvoicing += rankSubtotal(cell.rankLines ?? []);
    visitCharges += patrolSubtotal(cell.patrols ?? []);
    clientDeductions += sumClientDeductions(cell);
    cashReceived += Number(cell.amountReceived ?? 0);
  }

  return { totalInvoiced, rankInvoicing, visitCharges, clientDeductions, cashReceived, disputedInMonth };
}
