import type { SecurityWebsiteRateCard } from './security-website-types';
import type { RankPayEntry } from '../../../packages/rank-pay-matrix';

export type ServiceType = 'static' | 'patrol' | 'corporate' | 'event';
export type LocationTier = 'colombo' | 'greaterColombo' | 'other';
export type ShiftHours = 8 | 12 | 24;
export type ContractLength = 1 | 6 | 12;
export type ShiftCoverage = 'day' | 'night' | 'both';

export type EstimatorInput = {
  serviceType: ServiceType;
  locationTier: LocationTier;
  /** @deprecated Use rankQuantities — kept for URL param compatibility */
  guardsPerShift: number;
  rankQuantities: Record<string, number>;
  shiftCoverage: ShiftCoverage;
  hoursPerShift: ShiftHours;
  contractMonths: ContractLength;
  armed: boolean;
  supervisor: boolean;
};

export function shiftsPerDayFromCoverage(coverage: ShiftCoverage): number {
  return coverage === 'both' ? 2 : 1;
}

export type EstimatorResult = {
  monthlyLowLkr: number;
  monthlyHighLkr: number;
  monthlyMidLkr: number;
  breakdown: {
    baseMonthly: number;
    supervisorFee: number;
    armedPremium: number;
    contractDiscount: number;
  };
};

function shiftMultiplier(hours: ShiftHours, card: SecurityWebsiteRateCard): number {
  if (hours === 8) return card.shiftMultipliers.h8;
  if (hours === 12) return card.shiftMultipliers.h12;
  return card.shiftMultipliers.h24;
}

function locationMultiplier(tier: LocationTier, card: SecurityWebsiteRateCard): number {
  if (tier === 'colombo') return card.locationMultipliers.colombo;
  if (tier === 'greaterColombo') return card.locationMultipliers.greaterColombo;
  return card.locationMultipliers.other;
}

function serviceMultiplier(type: ServiceType, card: SecurityWebsiteRateCard): number {
  return card.serviceMultipliers[type];
}

function contractDiscount(months: ContractLength, card: SecurityWebsiteRateCard): number {
  if (months === 12) return card.contractDiscounts.m12;
  if (months === 6) return card.contractDiscounts.m6;
  return card.contractDiscounts.m1;
}

function clientRateForRank(card: SecurityWebsiteRateCard, rankCode: string): number {
  const code = rankCode.trim().toUpperCase();
  const entry = card.rankClientRates.find((r) => r.rankCode === code);
  return entry?.clientRatePerShift ?? 0;
}

function totalGuardsFromRanks(rankQuantities: Record<string, number>): number {
  return Object.values(rankQuantities).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0);
}

export function calculateSecurityEstimate(
  input: EstimatorInput,
  card: SecurityWebsiteRateCard,
  guardRanks: RankPayEntry[] = [],
): EstimatorResult {
  const rankQty = input.rankQuantities ?? {};
  const rankCodes =
    guardRanks.length > 0
      ? guardRanks.map((r) => r.rankCode)
      : card.rankClientRates.map((r) => r.rankCode);

  const activeRanks = rankCodes.filter((code) => (rankQty[code] ?? 0) > 0);
  const totalGuards =
    activeRanks.length > 0
      ? totalGuardsFromRanks(rankQty)
      : Math.max(1, input.guardsPerShift);

  const shiftMult = shiftMultiplier(input.hoursPerShift, card);
  const locMult = locationMultiplier(input.locationTier, card);
  const svcMult = serviceMultiplier(input.serviceType, card);
  const discount = contractDiscount(input.contractMonths, card);
  const shiftsPerDay = shiftsPerDayFromCoverage(input.shiftCoverage);

  let baseMonthly: number;

  if (activeRanks.length > 0) {
    const perShiftTotal = activeRanks.reduce((sum, code) => {
      const qty = rankQty[code] ?? 0;
      const rate = clientRateForRank(card, code);
      return sum + qty * rate;
    }, 0);
    baseMonthly =
      perShiftTotal *
      shiftsPerDay *
      card.daysPerMonth *
      locMult *
      svcMult *
      shiftMult;
  } else {
    baseMonthly =
      totalGuards *
      shiftsPerDay *
      card.daysPerMonth *
      card.baseRatePerGuardHour *
      shiftMult *
      locMult *
      svcMult;
  }

  const supervisorFee = input.supervisor ? card.supervisorMonthlyFee : 0;
  const armedPremium = input.armed
    ? card.armedPremiumPerGuardMonthly * totalGuards * shiftsPerDay
    : 0;

  const subtotal = baseMonthly + supervisorFee + armedPremium;
  const monthlyMid = Math.round(subtotal * discount);

  const monthlyLow = Math.round(monthlyMid * card.rankLowMultiplier);
  const monthlyHigh = Math.round(monthlyMid * card.rankHighMultiplier);

  return {
    monthlyLowLkr: monthlyLow,
    monthlyHighLkr: monthlyHigh,
    monthlyMidLkr: monthlyMid,
    breakdown: {
      baseMonthly: Math.round(baseMonthly * discount),
      supervisorFee: Math.round(supervisorFee * discount),
      armedPremium: Math.round(armedPremium * discount),
      contractDiscount: discount,
    },
  };
}

export function formatLkr(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;
}

export function formatLkrRange(low: number, high: number): string {
  if (low === high) return formatLkr(low);
  return `${formatLkr(low)} – ${formatLkr(high)}`;
}

export function parseEstimatorSearchParams(
  params: Record<string, string | string[] | undefined>,
): Partial<EstimatorInput> {
  const get = (key: string) => {
    const v = params[key];
    return typeof v === 'string' ? v : undefined;
  };

  const partial: Partial<EstimatorInput> = {};
  const service = get('service');
  if (service === 'static' || service === 'patrol' || service === 'corporate' || service === 'event') {
    partial.serviceType = service;
  }
  const location = get('location');
  if (location === 'colombo' || location === 'greaterColombo' || location === 'other') {
    partial.locationTier = location;
  }
  const guards = get('guards');
  if (guards) partial.guardsPerShift = Math.min(50, Math.max(1, parseInt(guards, 10) || 1));
  return partial;
}
