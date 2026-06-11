import type { ShiftType } from './shift-timing';

export type SiteShiftCoverage = 'both' | 'day' | 'night';

export type SiteShiftRequirementRow = {
  rank: string;
  shiftType: SiteShiftCoverage;
  qty: number;
};

type ShiftRowStored = {
  rank?: string;
  shiftType?: string;
  qty?: number;
};

function normalizeCoverage(value: unknown): SiteShiftCoverage {
  const raw = String(value ?? 'both').toLowerCase();
  if (raw === 'day' || raw === 'night') return raw;
  return 'both';
}

/** Reads `_shiftRows` saved on site_profiles.rate_matrix (falls back to legacy all-shift coverage). */
export function parseSiteShiftRows(rateMatrix: unknown): SiteShiftRequirementRow[] {
  if (!rateMatrix || typeof rateMatrix !== 'object') return [];

  const rows = (rateMatrix as { _shiftRows?: ShiftRowStored[] })._shiftRows;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => ({
      rank: String(row.rank ?? '').trim(),
      shiftType: normalizeCoverage(row.shiftType),
      qty: Math.max(0, Number(row.qty) || 0),
    }))
    .filter((row) => row.rank && row.qty > 0);
}

function shiftMatches(coverage: SiteShiftCoverage, shiftType: ShiftType): boolean {
  if (coverage === 'both') return true;
  if (shiftType === 'DAY') return coverage === 'day';
  return coverage === 'night';
}

export function requiredGuardsForShift(
  shiftRows: SiteShiftRequirementRow[],
  fallbackRequired: number,
  shiftType: ShiftType,
): number {
  if (!shiftRows.length) return fallbackRequired;

  const total = shiftRows
    .filter((row) => shiftMatches(row.shiftType, shiftType))
    .reduce((sum, row) => sum + row.qty, 0);

  return total;
}

export function siteAppliesToShift(
  shiftRows: SiteShiftRequirementRow[],
  shiftType: ShiftType,
): boolean {
  if (!shiftRows.length) return true;
  return requiredGuardsForShift(shiftRows, 0, shiftType) > 0;
}

export type ResolvedShiftSite = {
  value: string;
  label: string;
  required: number;
  shiftRows: SiteShiftRequirementRow[];
  contractRequired: number;
  readOnly: boolean;
};

function normalizeSiteKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Always lists assigned sites; includes submitted rows even when contract is for the other shift. */
export function resolveSitesForShiftView(
  sites: Array<{
    value: string;
    label: string;
    required: number;
    shiftRows: SiteShiftRequirementRow[];
  }>,
  shiftType: ShiftType,
  existing: Array<{ site_name: string; guard_epf: string }>,
): ResolvedShiftSite[] {
  const byKey = new Map<string, ResolvedShiftSite>();

  for (const site of sites) {
    const contractRequired = requiredGuardsForShift(
      site.shiftRows,
      site.required,
      shiftType,
    );
    const siteKey = normalizeSiteKey(site.value);
    const submittedCount = existing.filter(
      (entry) =>
        normalizeSiteKey(entry.site_name) === siteKey && Boolean(entry.guard_epf),
    ).length;

    const hasExplicitShiftRows = site.shiftRows.length > 0;
    const wrongShiftContract =
      hasExplicitShiftRows && contractRequired === 0 && submittedCount === 0;

    byKey.set(siteKey, {
      ...site,
      contractRequired,
      required: wrongShiftContract
        ? 0
        : Math.max(contractRequired, submittedCount, contractRequired > 0 ? 1 : 0),
      readOnly: wrongShiftContract,
    });
  }

  for (const entry of existing) {
    const siteKey = normalizeSiteKey(entry.site_name);
    if (byKey.has(siteKey)) continue;

    const submittedCount = existing.filter(
      (row) => normalizeSiteKey(row.site_name) === siteKey && Boolean(row.guard_epf),
    ).length;
    if (submittedCount === 0) continue;

    byKey.set(siteKey, {
      value: entry.site_name,
      label: entry.site_name,
      required: submittedCount,
      shiftRows: [],
      contractRequired: 0,
      readOnly: false,
    });
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}
