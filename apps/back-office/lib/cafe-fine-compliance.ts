import { maxVoluntaryDeductionsByPct } from '../app/fm/lib/fm-payroll-compliance';

/** Monthly deduction cap for café fines — `basic × max_deduction_pct%` (R-CAF-05). */
export function maxCafeDeductionsMtdLkr(
  monthlyBasicLkr: number,
  maxDeductionPct: number,
): number {
  return maxVoluntaryDeductionsByPct(monthlyBasicLkr, maxDeductionPct);
}

export function remainingCafeDeductionHeadroomLkr(input: {
  monthlyBasicLkr: number;
  currentDeductionsMtd: number;
  maxDeductionPct: number;
}): number {
  const cap = maxCafeDeductionsMtdLkr(input.monthlyBasicLkr, input.maxDeductionPct);
  return Number(Math.max(0, cap - Math.max(0, input.currentDeductionsMtd)).toFixed(2));
}

export function validateCafeDeductionsMtd(input: {
  monthlyBasicLkr: number;
  deductionsMtd: number;
  maxDeductionPct: number;
}): { ok: true } | { ok: false; error: string; maxDeductionsMtd: number } {
  const deductionsMtd = Math.max(0, Number(input.deductionsMtd) || 0);
  const maxDeductionsMtd = maxCafeDeductionsMtdLkr(
    input.monthlyBasicLkr,
    input.maxDeductionPct,
  );

  if (deductionsMtd <= maxDeductionsMtd + 0.009) {
    return { ok: true };
  }

  return {
    ok: false,
    error: `Monthly deductions exceed the ${input.maxDeductionPct}% basic cap (max LKR ${maxDeductionsMtd.toLocaleString('en-LK')}).`,
    maxDeductionsMtd,
  };
}

export function validateCafeFineDeduction(input: {
  monthlyBasicLkr: number;
  currentDeductionsMtd: number;
  fineAmount: number;
  maxDeductionPct: number;
}):
  | { ok: true; nextDeductionsMtd: number; maxDeductionsMtd: number }
  | { ok: false; error: string; maxDeductionsMtd: number } {
  const fineAmount = Math.max(0, Number(input.fineAmount) || 0);
  const currentDeductionsMtd = Math.max(0, Number(input.currentDeductionsMtd) || 0);
  const maxDeductionsMtd = maxCafeDeductionsMtdLkr(
    input.monthlyBasicLkr,
    input.maxDeductionPct,
  );

  if (fineAmount <= 0) {
    return {
      ok: false,
      error: 'Fine amount must be greater than zero.',
      maxDeductionsMtd,
    };
  }

  const nextDeductionsMtd = Number((currentDeductionsMtd + fineAmount).toFixed(2));
  const headroom = remainingCafeDeductionHeadroomLkr({
    monthlyBasicLkr: input.monthlyBasicLkr,
    currentDeductionsMtd,
    maxDeductionPct: input.maxDeductionPct,
  });

  if (nextDeductionsMtd > maxDeductionsMtd + 0.009) {
    return {
      ok: false,
      error: `Fine exceeds the ${input.maxDeductionPct}% monthly basic cap (max LKR ${maxDeductionsMtd.toLocaleString('en-LK')}; remaining LKR ${headroom.toLocaleString('en-LK')}).`,
      maxDeductionsMtd,
    };
  }

  return { ok: true, nextDeductionsMtd, maxDeductionsMtd };
}
