import type { RankPayEntry } from '../rank-pay-matrix';
import { adjustedMonthlyBasicFromRank, findRankPayEntry } from '../rank-pay-matrix';

export type GratuitySettings = {
  /** Minimum completed years of service before gratuity applies (Sri Lanka: typically 5). */
  minYears: number;
  /** Monthly basic is divided by this value before × years (Sri Lanka: ÷2 = half-month per year). */
  monthlyBasicDivisor: number;
};

export const DEFAULT_GRATUITY_SETTINGS: GratuitySettings = {
  minYears: 5,
  monthlyBasicDivisor: 2,
};

export function parseGratuitySettings(raw: unknown): GratuitySettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_GRATUITY_SETTINGS;
  const row = raw as Record<string, unknown>;
  const minYears = Math.max(0, Math.round(Number(row.minYears ?? row.min_years ?? 5)));
  const monthlyBasicDivisor = Math.max(
    1,
    Math.round(Number(row.monthlyBasicDivisor ?? row.monthly_basic_divisor ?? 2)),
  );
  return { minYears, monthlyBasicDivisor };
}

/** Full calendar years of service completed as of `asOfIso` (YYYY-MM-DD). */
export function completedYearsOfService(
  dateJoinedIso: string | null | undefined,
  asOfIso: string,
): number {
  if (!dateJoinedIso || !asOfIso) return 0;
  const join = new Date(`${dateJoinedIso.split('T')[0]}T12:00:00`);
  const asOf = new Date(`${asOfIso.split('T')[0]}T12:00:00`);
  if (Number.isNaN(join.getTime()) || Number.isNaN(asOf.getTime())) return 0;
  if (asOf < join) return 0;

  let years = asOf.getFullYear() - join.getFullYear();
  const monthDiff = asOf.getMonth() - join.getMonth();
  const dayDiff = asOf.getDate() - join.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return Math.max(0, years);
}

export type GratuityCalculation = {
  applicable: boolean;
  amountLkr: number;
  yearsOfService: number;
  monthlyBasicLkr: number;
  minYearsRequired: number;
  monthlyBasicDivisor: number;
  formulaNote: string;
};

/** Café corporate group / rank — statutory gratuity provision does not apply. */
export function isGratuityExcludedEmployee(input: {
  corporateGroup?: string | null;
  rank?: string | null;
  rankMatrix?: RankPayEntry[];
}): boolean {
  const group = (input.corporateGroup || '').trim().toUpperCase();
  if (group === 'CAFE') return true;
  if (input.rankMatrix?.length && input.rank) {
    const entry = findRankPayEntry(input.rankMatrix, input.rank);
    if (entry?.operationalGroup === 'CAFE') return true;
  }
  return false;
}

/**
 * Sri Lanka style: (monthly basic ÷ divisor) × completed years, when years ≥ minYears.
 * Café employees are excluded (hourly / separate employment terms).
 */
export function calculateGratuityProvision(input: {
  settings: GratuitySettings;
  rankMatrix: RankPayEntry[];
  rank: string | null | undefined;
  corporateGroup?: string | null;
  dateJoinedIso: string | null | undefined;
  asOfIso: string;
  recordedMonthlyBasicLkr?: number | null;
}): GratuityCalculation {
  const settings = parseGratuitySettings(input.settings);
  const yearsOfService = completedYearsOfService(input.dateJoinedIso, input.asOfIso);

  if (
    isGratuityExcludedEmployee({
      corporateGroup: input.corporateGroup,
      rank: input.rank,
      rankMatrix: input.rankMatrix,
    })
  ) {
    return {
      applicable: false,
      amountLkr: 0,
      yearsOfService,
      monthlyBasicLkr: 0,
      minYearsRequired: settings.minYears,
      monthlyBasicDivisor: settings.monthlyBasicDivisor,
      formulaNote: 'Gratuity provision does not apply to café employees.',
    };
  }

  const monthlyBasicLkr = adjustedMonthlyBasicFromRank(
    input.rankMatrix,
    input.rank,
    yearsOfService,
    input.recordedMonthlyBasicLkr,
  );

  const minYearsRequired = settings.minYears;
  const monthlyBasicDivisor = settings.monthlyBasicDivisor;

  if (yearsOfService < minYearsRequired || monthlyBasicLkr <= 0) {
    return {
      applicable: false,
      amountLkr: 0,
      yearsOfService,
      monthlyBasicLkr,
      minYearsRequired,
      monthlyBasicDivisor,
      formulaNote:
        yearsOfService < minYearsRequired
          ? `Gratuity applies after ${minYearsRequired} completed year(s) of service.`
          : 'Monthly basic pay is not on file for this employee.',
    };
  }

  const amountLkr = Math.round((monthlyBasicLkr / monthlyBasicDivisor) * yearsOfService);

  return {
    applicable: amountLkr > 0,
    amountLkr,
    yearsOfService,
    monthlyBasicLkr,
    minYearsRequired,
    monthlyBasicDivisor,
    formulaNote: `(LKR ${monthlyBasicLkr.toLocaleString()} ÷ ${monthlyBasicDivisor}) × ${yearsOfService} year(s)`,
  };
}
