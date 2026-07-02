import { describe, expect, it } from 'vitest';
import {
  applyFmPayrollCompliance,
  maxVoluntaryDeductionsByPct,
  validateVoluntaryDeductionCompliance,
} from './fm-payroll-compliance';

const CVS_COMPLIANCE = {
  maxDeductionPct: 5,
  statutoryTakehomeFloorPct: 5,
};

describe('applyFmPayrollCompliance', () => {
  it('caps advance-only deductions at max_deduction_pct of basic', () => {
    const result = applyFmPayrollCompliance({
      grossPay: 56_419,
      basicSalary: 35_000,
      statutoryDeductions: 4_514,
      voluntaryDeductions: 10_000,
      compliance: CVS_COMPLIANCE,
    });

    expect(maxVoluntaryDeductionsByPct(35_000, 5)).toBe(1_750);
    expect(result.allowedVoluntaryDeductions).toBe(1_750);
    expect(result.netPay).toBe(50_155);
    expect(result.complianceCapped).toBe(true);
  });

  it('caps combined advance and fine deductions at take-home floor', () => {
    const result = applyFmPayrollCompliance({
      grossPay: 20_000,
      basicSalary: 20_000,
      statutoryDeductions: 0,
      voluntaryDeductions: 20_000,
      compliance: CVS_COMPLIANCE,
    });

    expect(result.allowedVoluntaryDeductions).toBe(1_000);
    expect(result.netPay).toBe(19_000);
    expect(result.complianceCapped).toBe(true);
  });

  it('passes through deductions when within both caps', () => {
    const result = applyFmPayrollCompliance({
      grossPay: 20_000,
      basicSalary: 20_000,
      statutoryDeductions: 1_600,
      voluntaryDeductions: 500,
      compliance: CVS_COMPLIANCE,
    });

    expect(result.allowedVoluntaryDeductions).toBe(500);
    expect(result.netPay).toBe(17_900);
    expect(result.complianceCapped).toBe(false);
  });
});

describe('validateVoluntaryDeductionCompliance', () => {
  it('rejects advance scenarios that breach max_deduction_pct', () => {
    const result = validateVoluntaryDeductionCompliance({
      grossPay: 56_419,
      basicSalary: 35_000,
      statutoryDeductions: 4_514,
      requestedVoluntaryDeductions: 10_000,
      compliance: CVS_COMPLIANCE,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('5% basic cap');
    }
  });

  it('rejects fine scenarios that breach statutory take-home floor', () => {
    const result = validateVoluntaryDeductionCompliance({
      grossPay: 20_000,
      basicSalary: 400_000,
      statutoryDeductions: 0,
      requestedVoluntaryDeductions: 19_500,
      compliance: CVS_COMPLIANCE,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('take-home floor');
    }
  });
});
