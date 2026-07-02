import { describe, expect, it } from 'vitest';
import { flatMonthGrossFromStandardDay } from './compensation-engine';
import {
  computeCafeOtEdgeGrossLkr,
  computeCafeStandardShiftGrossLkr,
  computeFmPortfolioGuardShiftGrossLkr,
  computeGuardMonthSimulatorGross,
  computeGuardMonthSimulatorNetPay,
  engineMatchesDefaultFormulas,
  guardShiftGrossLkr,
} from './guard-day-type-pay';
import { computeEmployeePayrollStatutory } from '../../../packages/payroll-deductions';
import { resolveHoPayrollGrossLkr } from '../app/fm/lib/payroll-earnings-display';
import { computeSmGrossLkr } from '../app/fm/lib/sm-pay-settings';

const DEFAULT_STATUTORY = {
  epfEmployeeRate: 8,
  epfEmployerRate: 12,
  etfRate: 3,
  apitSlabs: [
    { min: 0, max: 150_000, rate: 0 },
    { min: 150_000, max: 233_333, rate: 6 },
    { min: 233_333, max: 275_000, rate: 18 },
    { min: 275_000, max: 316_667, rate: 24 },
    { min: 316_667, max: 358_334, rate: 30 },
    { min: 358_334, max: Infinity, rate: 36 },
  ],
  stampDutyLkr: 25,
  stampDutyThresholdLkr: 30_000,
};

const TOLERANCE = 1;

function pass(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= TOLERANCE;
}

describe('CVS calculation regression (§2.14.2)', () => {
  it('engine formulas match default MD pay strings', () => {
    expect(engineMatchesDefaultFormulas(35_000)).toBe(true);
    expect(engineMatchesDefaultFormulas(30_000)).toBe(true);
  });

  it('CVS-CALC-01 guard standard day @ CSO B=35000', () => {
    const expected = 2194.06;
    expect(pass(guardShiftGrossLkr(35_000, 'STANDARD'), expected)).toBe(true);
    expect(pass(computeFmPortfolioGuardShiftGrossLkr('STANDARD', 35_000), expected)).toBe(true);
    expect(
      pass(
        computeGuardMonthSimulatorGross(
          { std: 1, sun: 0, poya: 0, pubHol: 0, sat: 0 },
          35_000,
        ),
        expected,
      ),
    ).toBe(true);
  });

  it('CVS-CALC-02 guard month batch @ JSO B=30000', () => {
    const gross = flatMonthGrossFromStandardDay(30_000, { soWorkingDays: 20 });
    expect(pass(gross, 37_612.4)).toBe(true);
    const statutory = computeEmployeePayrollStatutory(gross, DEFAULT_STATUTORY);
    const net = Number((gross - statutory.epfEmployee).toFixed(2));
    expect(pass(net, 34_603.41)).toBe(true);
    const simGross = computeGuardMonthSimulatorGross(
      { std: 20, sun: 0, poya: 0, pubHol: 0, sat: 0 },
      30_000,
    );
    expect(pass(computeGuardMonthSimulatorNetPay(simGross), 34_603.41)).toBe(true);
  });

  it('CVS-CALC-03 guard POYA day @ B=35000', () => {
    const expected = 2806.73;
    expect(pass(guardShiftGrossLkr(35_000, 'POYA'), expected)).toBe(true);
    expect(pass(computeFmPortfolioGuardShiftGrossLkr('POYA', 35_000), expected)).toBe(true);
  });

  it('CVS-CALC-04 guard Saturday @ B=35000', () => {
    const expected = 2322.12;
    expect(pass(guardShiftGrossLkr(35_000, 'SATURDAY'), expected)).toBe(true);
    expect(pass(computeFmPortfolioGuardShiftGrossLkr('SATURDAY', 35_000), expected)).toBe(true);
  });

  it('CVS-CALC-05 café OT 48+2 edge @ B=30000', () => {
    expect(pass(computeCafeOtEdgeGrossLkr(30_000), 9807.81)).toBe(true);
  });

  it('CVS-CALC-06 café standard 9h shift @ B=30000', () => {
    expect(pass(computeCafeStandardShiftGrossLkr(30_000), 1730.79)).toBe(true);
  });

  it('CVS-CALC-07 SM per-visit tally (12 × 2500)', () => {
    const { totalGrossLkr } = computeSmGrossLkr(12, 'PER_VISIT_ONLY', 2500, 55_000);
    expect(pass(totalGrossLkr, 30_000)).toBe(true);
  });

  it('CVS-CALC-08 HO monthly gross = MNR basic (OD B=100000)', () => {
    const gross = resolveHoPayrollGrossLkr({
      basicSalary: 100_000,
      baseSalary: 100_000,
      rankMatrixBasicLkr: 100_000,
    });
    expect(pass(gross, 100_000)).toBe(true);
    const statutory = computeEmployeePayrollStatutory(gross, DEFAULT_STATUTORY);
    const net = Number((gross - statutory.epfEmployee).toFixed(2));
    expect(pass(net, 92_000)).toBe(true);
  });
});
