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

export function guardGrossAfterPenaltyShiftOffset(
  grossPay: number,
  totalShifts: number,
  penaltyAmountLkr: number,
): { grossPay: number; shiftsReduced: number; grossReductionLkr: number } {
  if (penaltyAmountLkr <= 0 || grossPay <= 0) {
    return { grossPay, shiftsReduced: 0, grossReductionLkr: 0 };
  }

  const perShiftLkr =
    totalShifts > 0 ? grossPay / totalShifts : grossPay / WB_WORKING_DAYS;
  const shiftsReduced = perShiftLkr > 0 ? Math.ceil(penaltyAmountLkr / perShiftLkr) : 0;
  const grossReductionLkr = shiftsReduced * perShiftLkr;

  return {
    grossPay: Math.max(0, Math.round(grossPay - grossReductionLkr)),
    shiftsReduced,
    grossReductionLkr,
  };
}

export function applyGuardPenaltyShiftOffset<
  T extends ShiftAdjustmentEmployee & {
    corporateGroup?: string;
    totalDeductions: number;
    netTakeHome: number;
    earnings?: {
      guardData?: unknown;
      smPayData?: {
        epfEmployeeLkr?: number;
        payeeTaxLkr?: number;
        stampDutyLkr?: number;
      };
    };
  },
>(emp: T): T {
  if (emp.corporateGroup !== 'GUARD_FIELD') return emp;

  const { penaltyAmountLkr, shiftsReduced, perShiftLkr } = getPenaltyShiftReduction({
    ...emp,
    recordedShiftsAtSite: emp.shiftsAtSite,
    fmShiftDelta: 0,
    shiftAuditLog: [],
  });
  if (penaltyAmountLkr <= 0 || shiftsReduced <= 0) return emp;

  const grossReductionLkr = shiftsReduced * perShiftLkr;
  const newGross = Math.max(0, Math.round(emp.totalGross - grossReductionLkr));
  const newShiftsAtSite = Math.max(0, emp.shiftsAtSite - shiftsReduced);
  const smStatutory = emp.earnings?.smPayData
    ? (emp.earnings.smPayData.epfEmployeeLkr ?? 0) +
      (emp.earnings.smPayData.payeeTaxLkr ?? 0) +
      (emp.earnings.smPayData.stampDutyLkr ?? 0)
    : 0;

  return {
    ...emp,
    totalGross: newGross,
    shiftsAtSite: newShiftsAtSite,
    netTakeHome: Math.max(0, newGross - emp.totalDeductions - smStatutory),
  };
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
