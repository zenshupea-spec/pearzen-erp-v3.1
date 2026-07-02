export type AdvanceSalarySettings = {
  /** Minimum shifts a guard must work in the salary month to qualify for a salary advance. */
  guardMinShifts: number;
  /** Maximum one-time advance amount for field guards. */
  guardMaxAdvanceLkr: number;
  /** Maximum one-time advance amount for HO, café, and sector manager staff. */
  otherEmployeeMaxAdvanceLkr: number;
};

export const DEFAULT_ADVANCE_SALARY_SETTINGS: AdvanceSalarySettings = {
  guardMinShifts: 12,
  guardMaxAdvanceLkr: 60_000,
  otherEmployeeMaxAdvanceLkr: 100_000,
};

/** Pre-filled amount when FM selects an employee on the Advance Salary desk. */
export const DEFAULT_FM_ADVANCE_AMOUNT_LKR = 5_000;

function parsePositiveLkr(raw: unknown, fallback: number) {
  return Math.max(0, Math.round(Number(raw ?? fallback)));
}

export function parseAdvanceSalarySettings(raw: unknown): AdvanceSalarySettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_ADVANCE_SALARY_SETTINGS;
  const row = raw as Record<string, unknown>;
  const guardMinShifts = Math.max(
    1,
    Math.min(31, Math.round(Number(row.guardMinShifts ?? row.guard_min_shifts ?? 12))),
  );
  return {
    guardMinShifts,
    guardMaxAdvanceLkr: parsePositiveLkr(
      row.guardMaxAdvanceLkr ?? row.guard_max_advance_lkr,
      DEFAULT_ADVANCE_SALARY_SETTINGS.guardMaxAdvanceLkr,
    ),
    otherEmployeeMaxAdvanceLkr: parsePositiveLkr(
      row.otherEmployeeMaxAdvanceLkr ?? row.other_employee_max_advance_lkr,
      DEFAULT_ADVANCE_SALARY_SETTINGS.otherEmployeeMaxAdvanceLkr,
    ),
  };
}

export function guardEligibleForAdvanceSalary(
  shiftsWorked: number,
  settings: AdvanceSalarySettings = DEFAULT_ADVANCE_SALARY_SETTINGS,
): boolean {
  return shiftsWorked >= settings.guardMinShifts;
}

export function maxAdvanceForEmployee(
  isGuard: boolean,
  settings: AdvanceSalarySettings = DEFAULT_ADVANCE_SALARY_SETTINGS,
): number {
  return isGuard ? settings.guardMaxAdvanceLkr : settings.otherEmployeeMaxAdvanceLkr;
}

export type AdvanceValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Shared server/UI guard for FM save, batch submit, MD approve, and HR approval. */
export function validateAdvanceAmount(input: {
  amount: number;
  isGuard: boolean;
  shiftsWorked: number;
  settings?: AdvanceSalarySettings;
}): AdvanceValidationResult {
  const settings = input.settings ?? DEFAULT_ADVANCE_SALARY_SETTINGS;
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, error: 'Advance amount must be at least LKR 1.' };
  }

  if (input.isGuard && !guardEligibleForAdvanceSalary(input.shiftsWorked, settings)) {
    return {
      ok: false,
      error: `Guard must work at least ${settings.guardMinShifts} shifts this month (recorded ${input.shiftsWorked}).`,
    };
  }

  const maxLkr = maxAdvanceForEmployee(input.isGuard, settings);
  if (amount > maxLkr) {
    return {
      ok: false,
      error: `Advance LKR ${amount.toLocaleString('en-LK')} exceeds the ${input.isGuard ? 'guard' : 'staff'} cap of LKR ${maxLkr.toLocaleString('en-LK')}.`,
    };
  }

  return { ok: true };
}
