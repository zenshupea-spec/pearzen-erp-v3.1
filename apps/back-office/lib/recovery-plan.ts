/** LKR tolerance band for treating recovery as "fully covered" without a partial final month */
export const RECOVERY_COVERAGE_TOLERANCE_LKR = 100;

export interface RecoverySchedule {
  durationMonths: number;
  totalPlan: number;
  shortfall: number;
  /** When set, the last month deducts this amount instead of the full monthly rate */
  finalMonthDeductionLkr: number | null;
  fullMonths: number;
}

/**
 * Computes a recovery schedule that fully covers the loss without over-collecting.
 * Uses full monthly deductions for all but the final month, which is prorated when needed.
 */
export function computeRecoverySchedule(
  totalLossLkr: number,
  monthlyDeductionLkr: number,
  toleranceLkr = RECOVERY_COVERAGE_TOLERANCE_LKR,
): RecoverySchedule {
  if (monthlyDeductionLkr <= 0 || totalLossLkr <= 0) {
    return {
      durationMonths: 0,
      totalPlan: 0,
      shortfall: totalLossLkr,
      finalMonthDeductionLkr: null,
      fullMonths: 0,
    };
  }

  const fullMonths = Math.floor(totalLossLkr / monthlyDeductionLkr);
  const remainder = totalLossLkr - fullMonths * monthlyDeductionLkr;

  if (remainder === 0) {
    return {
      durationMonths: fullMonths,
      totalPlan: totalLossLkr,
      shortfall: 0,
      finalMonthDeductionLkr: null,
      fullMonths,
    };
  }

  if (fullMonths === 0) {
    return {
      durationMonths: 1,
      totalPlan: totalLossLkr,
      shortfall: 0,
      finalMonthDeductionLkr: totalLossLkr,
      fullMonths: 0,
    };
  }

  if (remainder <= toleranceLkr) {
    const totalPlan = fullMonths * monthlyDeductionLkr;
    return {
      durationMonths: fullMonths,
      totalPlan,
      shortfall: remainder,
      finalMonthDeductionLkr: null,
      fullMonths,
    };
  }

  return {
    durationMonths: fullMonths + 1,
    totalPlan: totalLossLkr,
    shortfall: 0,
    finalMonthDeductionLkr: remainder,
    fullMonths,
  };
}

export function formatRecoveryDurationLabel(schedule: RecoverySchedule): string {
  if (schedule.durationMonths <= 0) return '— set shifts above';
  const n = schedule.durationMonths;
  const base = `${n} month${n !== 1 ? 's' : ''}`;
  if (schedule.finalMonthDeductionLkr == null) return base;
  if (schedule.fullMonths === 0) return `${base} (partial)`;
  return `${schedule.fullMonths} full + 1 prorated`;
}
