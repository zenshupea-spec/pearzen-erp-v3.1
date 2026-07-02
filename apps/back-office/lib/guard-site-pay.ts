import { calculateStandardDay, flatMonthGrossFromStandardDay, type GuardPayDayDivisors } from './compensation-engine';
import { completedYearsOfService } from '../../../packages/gratuity';
import {
  adjustedMonthlyBasicFromRank,
  type RankPayEntry,
} from '../../../packages/rank-pay-matrix';

export const GUARD_RANK_KEYS = ['CSO', 'OIC', 'SSO', 'JSO', 'LSO'] as const;
export type GuardRankKey = (typeof GUARD_RANK_KEYS)[number];

export type SiteRateMatrixEntry = {
  qty: number;
  invoiceRate: number;
  payRate: number;
  isEventBill?: boolean;
  eventLabel?: string;
};

export type GuardPayEngineFlags = {
  enforceFlatSiteRate: boolean;
  allowPoyaOnFlatRate: boolean;
};

export function normalizeGuardRank(rank: string | null | undefined): GuardRankKey {
  const u = String(rank ?? 'JSO').toUpperCase();
  return GUARD_RANK_KEYS.includes(u as GuardRankKey) ? (u as GuardRankKey) : 'JSO';
}

export function parseSiteRateMatrix(
  value: unknown,
): Partial<Record<GuardRankKey, SiteRateMatrixEntry>> {
  if (!value || typeof value !== 'object') return {};
  const out: Partial<Record<GuardRankKey, SiteRateMatrixEntry>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!GUARD_RANK_KEYS.includes(key as GuardRankKey) || !raw || typeof raw !== 'object') {
      continue;
    }
    const row = raw as Record<string, unknown>;
    const eventLabel =
      typeof row.eventLabel === 'string' ? row.eventLabel.trim() : undefined;
    out[key as GuardRankKey] = {
      qty: Number(row.qty) || 0,
      invoiceRate: Number(row.invoiceRate) || 0,
      payRate: Number(row.payRate) || 0,
      isEventBill: Boolean(row.isEventBill),
      eventLabel: eventLabel || undefined,
    };
  }
  return out;
}

function firstPositiveRate(
  matrix: Partial<Record<GuardRankKey, SiteRateMatrixEntry>>,
  rank: GuardRankKey,
  field: 'invoiceRate' | 'payRate',
): number {
  const entry = matrix[rank];
  if (entry?.[field]) return entry[field];
  const jso = matrix.JSO?.[field];
  if (jso) return jso;
  for (const key of GUARD_RANK_KEYS) {
    if (matrix[key]?.[field]) return matrix[key]![field];
  }
  return 0;
}

export function invoiceRateForRank(
  matrix: Partial<Record<GuardRankKey, SiteRateMatrixEntry>>,
  rank: GuardRankKey,
): number {
  return firstPositiveRate(matrix, rank, 'invoiceRate');
}

export function payRateForRank(
  matrix: Partial<Record<GuardRankKey, SiteRateMatrixEntry>>,
  rank: GuardRankKey,
): number {
  return firstPositiveRate(matrix, rank, 'payRate');
}

export function siteNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isLoanedSiteShift(
  homeSiteName: string | null | undefined,
  workSiteName: string,
): boolean {
  const home = siteNameKey(homeSiteName ?? '');
  const work = siteNameKey(workSiteName);
  if (!home || !work) return false;
  return home !== work;
}

export function grossPerGuardShift(input: {
  standardDayGrossLkr: number;
  sitePayRateLkr: number;
  isLoaned: boolean;
  flags: GuardPayEngineFlags;
}): number {
  if (input.flags.enforceFlatSiteRate && input.isLoaned && input.sitePayRateLkr > 0) {
    return input.sitePayRateLkr;
  }
  return input.standardDayGrossLkr;
}

export function guardGrossFromSiteShifts(input: {
  homeSiteName: string | null | undefined;
  rank: string | null | undefined;
  standardDayGrossLkr: number;
  siteShifts: { siteName: string; shifts: number; rateMatrix: unknown }[];
  flags: GuardPayEngineFlags;
}): number {
  const rank = normalizeGuardRank(input.rank);
  let total = 0;
  for (const row of input.siteShifts) {
    if (row.shifts <= 0) continue;
    const matrix = parseSiteRateMatrix(row.rateMatrix);
    const sitePayRate = payRateForRank(matrix, rank);
    const perShift = grossPerGuardShift({
      standardDayGrossLkr: input.standardDayGrossLkr,
      sitePayRateLkr: sitePayRate,
      isLoaned: isLoanedSiteShift(input.homeSiteName, row.siteName),
      flags: input.flags,
    });
    total += row.shifts * perShift;
  }
  return Math.round(total);
}

export function computeGuardMonthGrossPay(input: {
  homeSiteName: string | null | undefined;
  rank: string | null | undefined;
  dateJoined: string | null | undefined;
  rankMatrix: RankPayEntry[];
  periodEndIso: string;
  recordedBasic: number | null;
  sites: { id: string; site_name: string; rate_matrix: unknown }[];
  shiftCounts: Map<string, number>;
  employeeId: string;
  flags: GuardPayEngineFlags;
  dayDivisors?: Partial<GuardPayDayDivisors>;
  soWorkingDays?: number;
}): number {
  const years = completedYearsOfService(
    input.dateJoined != null ? String(input.dateJoined) : null,
    input.periodEndIso,
  );
  const monthlyBasicLkr = adjustedMonthlyBasicFromRank(
    input.rankMatrix,
    input.rank,
    years,
    input.recordedBasic,
  );
  const standardDayGrossLkr = calculateStandardDay(monthlyBasicLkr, input.dayDivisors).grossPay;

  const siteShifts = input.sites.map((site) => ({
    siteName: site.site_name,
    shifts: input.shiftCounts.get(`${input.employeeId}:${site.id}`) ?? 0,
    rateMatrix: site.rate_matrix,
  }));
  const shiftTotal = siteShifts.reduce((sum, row) => sum + row.shifts, 0);

  if (shiftTotal > 0) {
    return guardGrossFromSiteShifts({
      homeSiteName: input.homeSiteName,
      rank: input.rank,
      standardDayGrossLkr,
      siteShifts,
      flags: input.flags,
    });
  }

  return flatMonthGrossFromStandardDay(monthlyBasicLkr, {
    ...input.dayDivisors,
    soWorkingDays: input.soWorkingDays,
  });
}
