import { describe, expect, it } from 'vitest';

import {
  maxCafeDeductionsMtdLkr,
  validateCafeDeductionsMtd,
  validateCafeFineDeduction,
} from './cafe-fine-compliance';

describe('cafe-fine-compliance', () => {
  it('caps monthly deductions at max_deduction_pct of basic (CVS ASD @ 5%)', () => {
    expect(maxCafeDeductionsMtdLkr(30_000, 5)).toBe(1_500);
  });

  it('accepts fines within the monthly cap', () => {
    const result = validateCafeFineDeduction({
      monthlyBasicLkr: 30_000,
      currentDeductionsMtd: 500,
      fineAmount: 1_000,
      maxDeductionPct: 5,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextDeductionsMtd).toBe(1_500);
      expect(result.maxDeductionsMtd).toBe(1_500);
    }
  });

  it('rejects fines that breach the monthly cap', () => {
    const result = validateCafeFineDeduction({
      monthlyBasicLkr: 30_000,
      currentDeductionsMtd: 0,
      fineAmount: 2_000,
      maxDeductionPct: 5,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('5%');
      expect(result.error).toContain('1,500');
      expect(result.maxDeductionsMtd).toBe(1_500);
    }
  });

  it('rejects persisted deductions_mtd above cap', () => {
    const result = validateCafeDeductionsMtd({
      monthlyBasicLkr: 30_000,
      deductionsMtd: 1_501,
      maxDeductionPct: 5,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('basic cap');
    }
  });
});
