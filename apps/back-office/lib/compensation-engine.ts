export type PayStructureTag =
  | 'GUARD_STATUTORY'
  | 'SECTOR_MANAGER'
  | 'CAFE_HOURLY';

export interface EmployeeFinancialProfile {
  emp_number: string;
  starting_basic: number;
  annual_increment: number;
  years_of_service: number;
  pay_structure_tag: PayStructureTag;
  requires_md_approval: boolean;
}

export interface ShiftCalculationResult {
  shiftType: string;
  adjustedBasic: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  breakdown: {
    baseComponent: number;
    leaveComponent: number;
    overtimeComponent: number;
  };
  notes?: string;
}

export function calculateAdjustedBasic(
  profile: EmployeeFinancialProfile
): number {
  return profile.starting_basic + profile.annual_increment * profile.years_of_service;
}

export function calculateStandardDay(B: number): ShiftCalculationResult {
  const baseComponent = B / 26;
  const leaveComponent = (B / 26) * (14 / 12) * (1 / 26);
  const overtimeComponent = (B / 200) * 1.5 * 3;
  const gross = Number(
    (baseComponent + leaveComponent + overtimeComponent).toFixed(2)
  );
  return {
    shiftType: 'STANDARD',
    adjustedBasic: B,
    grossPay: gross,
    deductions: 0,
    netPay: gross,
    breakdown: {
      baseComponent: Number(baseComponent.toFixed(2)),
      leaveComponent: Number(leaveComponent.toFixed(2)),
      overtimeComponent: Number(overtimeComponent.toFixed(2)),
    },
  };
}

export function calculatePoyaDay(B: number): ShiftCalculationResult {
  const baseComponent = (B / 26) * 1.5;
  const overtimeComponent = (B / 200) * 1.5 * 3;
  const gross = Number((baseComponent + overtimeComponent).toFixed(2));
  return {
    shiftType: 'POYA',
    adjustedBasic: B,
    grossPay: gross,
    deductions: 0,
    netPay: gross,
    breakdown: {
      baseComponent: Number(baseComponent.toFixed(2)),
      leaveComponent: 0,
      overtimeComponent: Number(overtimeComponent.toFixed(2)),
    },
  };
}

export function calculateWeeklyHoliday(B: number): ShiftCalculationResult {
  const overtimeComponent = (B / 200) * 1.5 * 11;
  const gross = Number(overtimeComponent.toFixed(2));
  return {
    shiftType: 'WEEKLY_HOLIDAY',
    adjustedBasic: B,
    grossPay: gross,
    deductions: 0,
    netPay: gross,
    breakdown: {
      baseComponent: 0,
      leaveComponent: 0,
      overtimeComponent: Number(overtimeComponent.toFixed(2)),
    },
  };
}

export function calculateSaturday(B: number): ShiftCalculationResult {
  const baseComponent = (B / 26) * (6 / 8);
  const overtimeComponent = (B / 200) * 1.5 * 5;
  const gross = Number((baseComponent + overtimeComponent).toFixed(2));
  return {
    shiftType: 'SATURDAY',
    adjustedBasic: B,
    grossPay: gross,
    deductions: 0,
    netPay: gross,
    breakdown: {
      baseComponent: Number(baseComponent.toFixed(2)),
      leaveComponent: 0,
      overtimeComponent: Number(overtimeComponent.toFixed(2)),
    },
  };
}

export function calculateSectorManagerTally(
  visitsCompleted: number,
  ratePerVisit: number
): ShiftCalculationResult {
  const grossPay = visitsCompleted * ratePerVisit;
  return {
    shiftType: 'SECTOR_MANAGER_TALLY',
    adjustedBasic: 0,
    grossPay: Number(grossPay.toFixed(2)),
    deductions: 0,
    netPay: Number(grossPay.toFixed(2)),
    breakdown: {
      baseComponent: Number(grossPay.toFixed(2)),
      leaveComponent: 0,
      overtimeComponent: 0,
    },
    notes: `${visitsCompleted} Site Visits @ ${ratePerVisit} LKR`,
  };
}

export function calculateCafeShift(
  hoursWorked: number,
  hourlyRate: number,
  isOver48Threshold: boolean
): ShiftCalculationResult {
  let baseHours = hoursWorked;
  let otHours = 0;

  if (isOver48Threshold) {
    baseHours = 0;
    otHours = hoursWorked;
  }

  const baseComponent = baseHours * hourlyRate;
  const overtimeComponent = otHours * (hourlyRate * 1.5);
  const gross = Number((baseComponent + overtimeComponent).toFixed(2));

  return {
    shiftType: 'CAFE_HOURLY',
    adjustedBasic: 0,
    grossPay: gross,
    deductions: 0,
    netPay: gross,
    breakdown: {
      baseComponent: Number(baseComponent.toFixed(2)),
      leaveComponent: 0,
      overtimeComponent: Number(overtimeComponent.toFixed(2)),
    },
  };
}

export function processShiftPay(
  profile: EmployeeFinancialProfile,
  dayType: 'STANDARD' | 'POYA' | 'WEEKLY_HOLIDAY' | 'SATURDAY',
  meta?: {
    visitsCompleted?: number;
    ratePerVisit?: number;
    hoursWorked?: number;
    hourlyRate?: number;
    isOver48Threshold?: boolean;
    approvedAdvance?: number;
  }
): ShiftCalculationResult {
  if (profile.requires_md_approval) {
    throw new Error(
      `PAYROLL LOCKED: ${profile.emp_number} has a custom salary pending MD approval. Access Denied.`
    );
  }

  let result: ShiftCalculationResult;

  if (profile.pay_structure_tag === 'SECTOR_MANAGER') {
    result = calculateSectorManagerTally(
      meta?.visitsCompleted || 0,
      meta?.ratePerVisit || 0
    );
  } else if (profile.pay_structure_tag === 'CAFE_HOURLY') {
    result = calculateCafeShift(
      meta?.hoursWorked || 0,
      meta?.hourlyRate || 0,
      meta?.isOver48Threshold || false
    );
  } else {
    const B = calculateAdjustedBasic(profile);
    switch (dayType) {
      case 'STANDARD':
        result = calculateStandardDay(B);
        break;
      case 'POYA':
        result = calculatePoyaDay(B);
        break;
      case 'WEEKLY_HOLIDAY':
        result = calculateWeeklyHoliday(B);
        break;
      case 'SATURDAY':
        result = calculateSaturday(B);
        break;
      default:
        throw new Error(
          `CRITICAL: Invalid Day Type [${dayType}] passed to Guard Compensation Engine.`
        );
    }
  }

  // THE DEDUCTOR: Apply approved advances to the final Net Pay
  if (meta?.approvedAdvance && meta.approvedAdvance > 0) {
    result.deductions = meta.approvedAdvance;
    // Ensure Net Pay doesn't drop below 0 mathematically
    result.netPay = Math.max(
      0,
      Number((result.grossPay - meta.approvedAdvance).toFixed(2))
    );
    result.notes = result.notes
      ? `${result.notes} | Advance Deduction: -${meta.approvedAdvance} LKR`
      : `Advance Deduction: -${meta.approvedAdvance} LKR`;
  }

  return result;
}
