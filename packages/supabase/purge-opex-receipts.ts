import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isOpexReceiptEligibleForPurge,
  OPEX_RECEIPT_PERMANENT_THRESHOLD_LKR,
  OPEX_RECEIPT_RETENTION_DAYS,
  parseOpexReceiptStorageRef,
  removeOpexReceiptObject,
} from './opex-receipt-storage';

export const OPEX_RECEIPT_PURGE_BATCH = 500;

export type PurgeOpexReceiptsResult = {
  billsCleared: number;
  objectsRemoved: number;
  referenceDate: string;
  retentionDays: number;
  permanentThresholdLkr: number;
};

export async function purgeOpexReceipts(
  supabase: SupabaseClient,
  referenceDate = new Date().toISOString().slice(0, 10),
): Promise<PurgeOpexReceiptsResult> {
  const { data: rows, error } = await supabase
    .from('expense_bills')
    .select('id, bill_date, amount, receipt_url')
    .not('receipt_url', 'is', null)
    .neq('receipt_url', '')
    .lte('amount', OPEX_RECEIPT_PERMANENT_THRESHOLD_LKR)
    .limit(OPEX_RECEIPT_PURGE_BATCH);

  if (error) {
    throw new Error(`expense_bills fetch: ${error.message}`);
  }

  let billsCleared = 0;
  let objectsRemoved = 0;

  for (const row of rows ?? []) {
    const billDate = String(row.bill_date ?? '').slice(0, 10);
    const amount = Number(row.amount ?? 0);
    const receiptUrl = String(row.receipt_url ?? '');

    if (!billDate || !receiptUrl.trim()) continue;
    if (!isOpexReceiptEligibleForPurge(billDate, amount, referenceDate)) continue;
    if (!parseOpexReceiptStorageRef(receiptUrl)) continue;

    const removed = await removeOpexReceiptObject(supabase, receiptUrl);
    if (removed) objectsRemoved += 1;

    const { error: updateError } = await supabase
      .from('expense_bills')
      .update({ receipt_url: '', updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (!updateError) billsCleared += 1;
  }

  return {
    billsCleared,
    objectsRemoved,
    referenceDate,
    retentionDays: OPEX_RECEIPT_RETENTION_DAYS,
    permanentThresholdLkr: OPEX_RECEIPT_PERMANENT_THRESHOLD_LKR,
  };
}
