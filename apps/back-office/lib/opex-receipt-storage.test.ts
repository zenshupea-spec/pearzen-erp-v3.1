import { describe, expect, it } from 'vitest';

import {
  isOpexReceiptEligibleForPurge,
  OPEX_RECEIPT_PERMANENT_THRESHOLD_LKR,
  OPEX_RECEIPT_RETENTION_DAYS,
} from '../../../packages/supabase/opex-receipt-storage';

describe('opex receipt purge eligibility', () => {
  it('purges bills at or below LKR 30k after 60 days from bill_date', () => {
    expect(
      isOpexReceiptEligibleForPurge('2026-01-01', 25_000, '2026-03-03'),
    ).toBe(true);
    expect(
      isOpexReceiptEligibleForPurge('2026-01-01', 25_000, '2026-03-01'),
    ).toBe(false);
  });

  it('retains receipts for bills above the permanent threshold', () => {
    expect(
      isOpexReceiptEligibleForPurge(
        '2026-01-01',
        OPEX_RECEIPT_PERMANENT_THRESHOLD_LKR + 1,
        '2026-12-31',
      ),
    ).toBe(false);
  });

  it('uses a 60-day retention window', () => {
    expect(OPEX_RECEIPT_RETENTION_DAYS).toBe(60);
  });
});
