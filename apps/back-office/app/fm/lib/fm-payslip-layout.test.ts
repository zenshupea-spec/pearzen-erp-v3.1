import { describe, expect, it } from 'vitest';

import {
  countCalendarDaysForMonth,
  fixedSalaryCalendarShiftLines,
  resolveGuardPayslipEarnings,
  resolveSmPayslipEarnings,
  resolvePayslipStatutory,
} from './fm-payslip-layout';
import type { FmPayrollRosterRow } from './fm-payroll-roster-data';

function baseRow(overrides: Partial<FmPayrollRosterRow> = {}): FmPayrollRosterRow {
  return {
    id: '1',
    workforceGroup: 'cvs',
    epfNo: 'EPF-HO-10000',
    empNumber: '10000',
    name: 'Test Employee',
    rank: 'MD',
    sector: 'Western',
    site: 'CVS',
    salaryLkr: 100_000,
    earningsLkr: 100_000,
    deductionsLkr: 0,
    advanceDeductionLkr: 0,
    netPayLkr: 0,
    payslipId: 'PS-TEST',
    payslipKind: 'ho_fixed',
    ...overrides,
  };
}

describe('countCalendarDaysForMonth', () => {
  it('counts July 2026 weekdays, Saturdays, and Sundays', () => {
    expect(countCalendarDaysForMonth(2026, 7)).toEqual({
      weekdays: 23,
      saturdays: 4,
      sundays: 4,
    });
  });
});

describe('fixedSalaryCalendarShiftLines', () => {
  it('shows calendar counts with zero amounts for fixed-salary staff', () => {
    const lines = fixedSalaryCalendarShiftLines('Jul 2026');
    expect(lines).toEqual([
      { label: 'Basic shift pay', shifts: 23, amountLkr: 0 },
      { label: 'Saturday', shifts: 4, amountLkr: 0 },
      { label: 'Sunday', shifts: 4, amountLkr: 0 },
      { label: 'Poyaday', shifts: 0, amountLkr: 0 },
      { label: 'Public Holiday', shifts: 0, amountLkr: 0 },
    ]);
  });
});

describe('resolvePayslipStatutory', () => {
  it('always returns APIT and stamp values (0 when not eligible)', () => {
    const low = resolvePayslipStatutory(baseRow({ earningsLkr: 20_000, salaryLkr: 20_000 }));
    expect(low.payeeTaxLkr).toBe(0);
    expect(low.stampDutyLkr).toBe(0);

    const high = resolvePayslipStatutory(baseRow({ earningsLkr: 200_000, salaryLkr: 200_000 }));
    expect(high.payeeTaxLkr).toBeGreaterThan(0);
    expect(high.stampDutyLkr).toBe(25);
  });
});

describe('resolveGuardPayslipEarnings', () => {
  it('uses formula gross for shift box and site-rate excess as allowance', () => {
    const split = resolveGuardPayslipEarnings(
      baseRow({
        workforceGroup: 'guard',
        payslipKind: 'guard',
        totalShifts: 22,
        guardFormulaGrossLkr: 42_000,
        guardSiteRateGrossLkr: 50_000,
        siteAllowanceLkr: 8_000,
        shiftTypeLines: [
          { label: 'Basic shift pay', shifts: 18, amountLkr: 30_000 },
          { label: 'Saturday', shifts: 4, amountLkr: 12_000 },
        ],
      }),
    );

    expect(split.basicShiftPaidTotalLkr).toBe(42_000);
    expect(split.siteAllowanceLkr).toBe(8_000);
    expect(split.totalShifts).toBe(22);
  });
});

describe('resolveSmPayslipEarnings', () => {
  it('splits fixed + per-visit mode as basic plus visit pay', () => {
    const split = resolveSmPayslipEarnings(
      baseRow({
        workforceGroup: 'cvs_sm',
        payslipKind: 'sm',
        earningsLkr: 85_000,
        smVisitPayLkr: 30_000,
        smFixedBasicLkr: 55_000,
      }),
      'FIXED_AND_PER_VISIT',
    );
    expect(split).toEqual({
      basicSalaryLkr: 55_000,
      siteAllowanceLkr: 30_000,
      totalEarningsLkr: 85_000,
    });
  });

  it('shows visit-only earnings as basic plus site allowance minus basic', () => {
    const split = resolveSmPayslipEarnings(
      baseRow({
        workforceGroup: 'cvs_sm',
        payslipKind: 'sm',
        earningsLkr: 30_000,
        smVisitPayLkr: 30_000,
        smFixedBasicLkr: 55_000,
      }),
      'PER_VISIT_ONLY',
    );
    expect(split.basicSalaryLkr).toBe(55_000);
    expect(split.siteAllowanceLkr).toBe(-25_000);
    expect(split.totalEarningsLkr).toBe(30_000);
  });
});
