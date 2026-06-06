export const WB_WORKING_DAYS = 26;

export type ShiftAuditSource = 'SYSTEM' | 'PENALTY' | 'FM';

export type ShiftAuditEntry = {
  id: string;
  at: string;
  source: ShiftAuditSource;
  previousShifts: number;
  newShifts: number;
  detail: string;
};

export type ShiftAdjustmentEmployee = {
  recordedShiftsAtSite: number;
  fmShiftDelta: number;
  shiftAuditLog: ShiftAuditEntry[];
  shiftsAtSite: number;
  totalGross: number;
  deductions: { type: string; thisMonthAmount: number }[];
  earnings: {
    crossSiteDistribution: { site: string; shifts: number }[];
  };
};

export function getPenaltyShiftReduction(employee: ShiftAdjustmentEmployee): {
  penaltyAmountLkr: number;
  shiftsReduced: number;
  perShiftLkr: number;
} {
  const penaltyAmountLkr = employee.deductions
    .filter((d) => d.type === 'Penalty')
    .reduce((sum, d) => sum + d.thisMonthAmount, 0);

  if (penaltyAmountLkr <= 0) {
    return { penaltyAmountLkr: 0, shiftsReduced: 0, perShiftLkr: 0 };
  }

  const totalShifts = employee.earnings.crossSiteDistribution.reduce(
    (sum, e) => sum + e.shifts,
    0,
  );
  const perShiftLkr =
    totalShifts > 0
      ? employee.totalGross / totalShifts
      : employee.totalGross / WB_WORKING_DAYS;
  const shiftsReduced =
    perShiftLkr > 0 ? Math.ceil(penaltyAmountLkr / perShiftLkr) : 0;

  return { penaltyAmountLkr, shiftsReduced, perShiftLkr };
}

export function effectiveShiftsAtSite(employee: ShiftAdjustmentEmployee): number {
  const { shiftsReduced } = getPenaltyShiftReduction(employee);
  return Math.max(
    0,
    employee.recordedShiftsAtSite - shiftsReduced + employee.fmShiftDelta,
  );
}

export function syncEmployeeShiftCount<T extends ShiftAdjustmentEmployee>(
  employee: T,
): T {
  return {
    ...employee,
    shiftsAtSite: effectiveShiftsAtSite(employee),
  };
}

export function formatShiftChange(previous: number, next: number): string {
  return `${previous} → ${next}`;
}
