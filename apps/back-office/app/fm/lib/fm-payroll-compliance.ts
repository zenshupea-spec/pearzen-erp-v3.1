import type { FmPortfolioDeduction } from './fm-employee-deduction-plans';

export type PayrollComplianceSettings = {
  maxDeductionPct: number;
  statutoryTakehomeFloorPct: number;
};

export type ApplyFmPayrollComplianceInput = {
  grossPay: number;
  basicSalary: number;
  statutoryDeductions: number;
  voluntaryDeductions: number;
  compliance: PayrollComplianceSettings;
};

export type ApplyFmPayrollComplianceResult = {
  netPay: number;
  allowedVoluntaryDeductions: number;
  cappedVoluntaryDeductions: number;
  complianceCapped: boolean;
};

export function maxVoluntaryDeductionsByPct(basicSalary: number, maxDeductionPct: number): number {
  if (basicSalary <= 0 || maxDeductionPct <= 0) return 0;
  return Number((basicSalary * (maxDeductionPct / 100)).toFixed(2));
}

export function maxVoluntaryDeductionsByTakehomeFloor(
  grossPay: number,
  statutoryDeductions: number,
  takehomeFloorPct: number,
): number {
  if (grossPay <= 0) return 0;
  const minNet = grossPay * (takehomeFloorPct / 100);
  return Number(Math.max(0, grossPay - statutoryDeductions - minNet).toFixed(2));
}

export function applyFmPayrollCompliance(
  input: ApplyFmPayrollComplianceInput,
): ApplyFmPayrollComplianceResult {
  const {
    grossPay,
    basicSalary,
    statutoryDeductions,
    voluntaryDeductions,
    compliance,
  } = input;

  const requested = Math.max(0, voluntaryDeductions);
  const maxByPct = maxVoluntaryDeductionsByPct(basicSalary, compliance.maxDeductionPct);
  const maxByFloor = maxVoluntaryDeductionsByTakehomeFloor(
    grossPay,
    statutoryDeductions,
    compliance.statutoryTakehomeFloorPct,
  );
  const maxByGross = Math.max(0, grossPay - statutoryDeductions);
  const allowedVoluntary = Math.min(requested, maxByPct, maxByFloor, maxByGross);
  const netPay = Number(Math.max(0, grossPay - statutoryDeductions - allowedVoluntary).toFixed(2));

  return {
    netPay,
    allowedVoluntaryDeductions: allowedVoluntary,
    cappedVoluntaryDeductions: Number((requested - allowedVoluntary).toFixed(2)),
    complianceCapped: allowedVoluntary + 0.009 < requested,
  };
}

export function scaleVoluntaryDeductionRows(
  deductions: FmPortfolioDeduction[],
  allowedTotal: number,
): FmPortfolioDeduction[] {
  const current = deductions.reduce((sum, row) => sum + row.thisMonthAmount, 0);
  if (current <= allowedTotal || current <= 0 || allowedTotal <= 0) {
    if (allowedTotal <= 0 && current > 0) {
      return deductions.map((row) => ({ ...row, thisMonthAmount: 0 }));
    }
    return deductions;
  }

  const scale = allowedTotal / current;
  const scaled = deductions.map((row) => ({
    ...row,
    thisMonthAmount: Number((row.thisMonthAmount * scale).toFixed(2)),
  }));

  const scaledTotal = scaled.reduce((sum, row) => sum + row.thisMonthAmount, 0);
  const remainder = Number((allowedTotal - scaledTotal).toFixed(2));
  if (remainder !== 0) {
    const lastIndex = scaled.findLastIndex((row) => row.thisMonthAmount > 0);
    if (lastIndex >= 0) {
      scaled[lastIndex] = {
        ...scaled[lastIndex],
        thisMonthAmount: Number((scaled[lastIndex].thisMonthAmount + remainder).toFixed(2)),
      };
    }
  }

  return scaled;
}

export function resolveFmPortfolioBasicSalary(emp: {
  totalGross: number;
  earnings?: {
    hoFixedData?: { mnrBaseSalaryLkr: number };
    cafeData?: { monthlyBasicLkr: number };
    smPayData?: { fixedBasicLkr: number };
    guardData?: { monthlyBasicLkr: number };
    basePayLkr?: number;
  };
}): number {
  const earnings = emp.earnings;
  if (earnings?.hoFixedData?.mnrBaseSalaryLkr) return earnings.hoFixedData.mnrBaseSalaryLkr;
  if (earnings?.cafeData?.monthlyBasicLkr) return earnings.cafeData.monthlyBasicLkr;
  if (earnings?.smPayData?.fixedBasicLkr) return earnings.smPayData.fixedBasicLkr;
  if (earnings?.guardData?.monthlyBasicLkr) return earnings.guardData.monthlyBasicLkr;
  if (earnings?.basePayLkr) return earnings.basePayLkr;
  return emp.totalGross;
}

export function validateVoluntaryDeductionCompliance(input: {
  grossPay: number;
  basicSalary: number;
  statutoryDeductions: number;
  requestedVoluntaryDeductions: number;
  compliance: PayrollComplianceSettings;
}): { ok: true } | { ok: false; error: string } {
  const result = applyFmPayrollCompliance({
    grossPay: input.grossPay,
    basicSalary: input.basicSalary,
    statutoryDeductions: input.statutoryDeductions,
    voluntaryDeductions: input.requestedVoluntaryDeductions,
    compliance: input.compliance,
  });

  if (!result.complianceCapped) return { ok: true };

  const maxByPct = maxVoluntaryDeductionsByPct(
    input.basicSalary,
    input.compliance.maxDeductionPct,
  );
  const maxByFloor = maxVoluntaryDeductionsByTakehomeFloor(
    input.grossPay,
    input.statutoryDeductions,
    input.compliance.statutoryTakehomeFloorPct,
  );
  const allowed = result.allowedVoluntaryDeductions;

  if (input.requestedVoluntaryDeductions > maxByPct + 0.009) {
    return {
      ok: false,
      error: `Monthly deductions exceed the ${input.compliance.maxDeductionPct}% basic cap (max LKR ${maxByPct.toLocaleString('en-LK')}).`,
    };
  }

  if (input.requestedVoluntaryDeductions > maxByFloor + 0.009) {
    return {
      ok: false,
      error: `Net pay would fall below the ${input.compliance.statutoryTakehomeFloorPct}% statutory take-home floor (max deductions LKR ${maxByFloor.toLocaleString('en-LK')}).`,
    };
  }

  return {
    ok: false,
    error: `Monthly deductions exceed the compliance cap (max LKR ${allowed.toLocaleString('en-LK')}).`,
  };
}
