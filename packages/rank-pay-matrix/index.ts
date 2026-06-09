export type OperationalGroup =
  | 'GUARD_FIELD'
  | 'GUARD'
  | 'CAFE'
  | 'SECTOR_MANAGER'
  | 'HEAD_OFFICE';

export type RankSalaryType = 'BANK' | 'CASH';

export interface RankPayEntry {
  id: string;
  rankCode: string;
  fullTitle: string;
  basicPay: number;
  /** Added to base monthly pay for each completed year of service. */
  annualIncrement: number;
  /** Default disbursement channel for this rank (BANK or CASH). */
  salaryType: RankSalaryType;
  operationalGroup: OperationalGroup;
}

export const DEFAULT_RANK_PAY_MATRIX: RankPayEntry[] = [
  {
    id: 'rp-1',
    rankCode: 'CSO',
    fullTitle: 'CHIEF SECURITY OFFICER',
    basicPay: 35000,
    annualIncrement: 2000,
    salaryType: 'BANK',
    operationalGroup: 'GUARD_FIELD',
  },
  {
    id: 'rp-2',
    rankCode: 'OIC',
    fullTitle: 'OFFICER IN CHARGE',
    basicPay: 33000,
    annualIncrement: 1800,
    salaryType: 'BANK',
    operationalGroup: 'GUARD_FIELD',
  },
  {
    id: 'rp-3',
    rankCode: 'SSO',
    fullTitle: 'SENIOR SECURITY OFFICER',
    basicPay: 32000,
    annualIncrement: 1500,
    salaryType: 'BANK',
    operationalGroup: 'GUARD_FIELD',
  },
  {
    id: 'rp-4',
    rankCode: 'JSO',
    fullTitle: 'JUNIOR SECURITY OFFICER',
    basicPay: 30000,
    annualIncrement: 1200,
    salaryType: 'BANK',
    operationalGroup: 'GUARD_FIELD',
  },
  {
    id: 'rp-5',
    rankCode: 'LSO',
    fullTitle: 'LADY SECURITY OFFICER',
    basicPay: 30000,
    annualIncrement: 1200,
    salaryType: 'BANK',
    operationalGroup: 'GUARD_FIELD',
  },
];

const VALID_GROUPS = new Set<string>([
  'GUARD_FIELD',
  'GUARD',
  'CAFE',
  'SECTOR_MANAGER',
  'HEAD_OFFICE',
]);

const VALID_SALARY_TYPES = new Set<string>(['BANK', 'CASH']);

export function parseRankPayMatrix(raw: unknown): RankPayEntry[] {
  if (!Array.isArray(raw)) return DEFAULT_RANK_PAY_MATRIX;

  const parsed = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const rankCode =
        typeof row.rankCode === 'string'
          ? row.rankCode.trim().toUpperCase()
          : typeof row.rank_code === 'string'
            ? row.rank_code.trim().toUpperCase()
            : '';
      const fullTitle =
        typeof row.fullTitle === 'string'
          ? row.fullTitle.trim().toUpperCase()
          : typeof row.full_title === 'string'
            ? row.full_title.trim().toUpperCase()
            : '';
      const basicPay = Math.max(0, Math.round(Number(row.basicPay ?? row.basic_pay ?? 0)));
      const annualIncrement = Math.max(
        0,
        Math.round(Number(row.annualIncrement ?? row.annual_increment ?? 0)),
      );
      const groupRaw = String(row.operationalGroup ?? row.operational_group ?? 'GUARD_FIELD');
      const operationalGroup = VALID_GROUPS.has(groupRaw)
        ? (groupRaw as OperationalGroup)
        : 'GUARD_FIELD';
      const salaryTypeRaw = String(row.salaryType ?? row.salary_type ?? 'BANK').toUpperCase();
      const salaryType = VALID_SALARY_TYPES.has(salaryTypeRaw)
        ? (salaryTypeRaw as RankSalaryType)
        : 'BANK';
      const id =
        typeof row.id === 'string' && row.id.trim()
          ? row.id.trim()
          : `rp-${rankCode.toLowerCase()}`;
      if (!rankCode || !fullTitle) return null;
      return { id, rankCode, fullTitle, basicPay, annualIncrement, salaryType, operationalGroup };
    })
    .filter((entry): entry is RankPayEntry => entry !== null);

  return parsed.length > 0 ? parsed : DEFAULT_RANK_PAY_MATRIX;
}

export function rankCodesInOrder(matrix: RankPayEntry[]): string[] {
  return matrix.map((r) => r.rankCode);
}

export function rankSortIndex(matrix: RankPayEntry[], rank: string | null | undefined): number {
  if (!rank) return 999;
  const code = rank.trim().toUpperCase();
  const idx = matrix.findIndex((r) => r.rankCode === code);
  return idx === -1 ? 998 : idx;
}

export function isRankInMatrix(matrix: RankPayEntry[], rank: string | null | undefined): boolean {
  if (!rank?.trim()) return true;
  if (matrix.length === 0) return false;
  const code = rank.trim().toUpperCase();
  return matrix.some((r) => r.rankCode === code);
}

/** HR induction / MNR corporate group (employees.group column). */
export type CorporateGroup = 'GUARD' | 'SECTOR_MANAGER' | 'HEAD_OFFICE' | 'CAFE';

const CORPORATE_GROUP_OPS: Record<CorporateGroup, OperationalGroup[]> = {
  GUARD: ['GUARD_FIELD', 'GUARD'],
  SECTOR_MANAGER: ['SECTOR_MANAGER'],
  HEAD_OFFICE: ['HEAD_OFFICE'],
  CAFE: ['CAFE'],
};

export function ranksForCorporateGroup(
  matrix: RankPayEntry[],
  corporateGroup: string | null | undefined,
): RankPayEntry[] {
  const key = (corporateGroup || '').trim().toUpperCase() as CorporateGroup;
  const ops = CORPORATE_GROUP_OPS[key];
  if (!ops) return [];
  return matrix.filter((r) => ops.includes(r.operationalGroup));
}

export function isRankValidForCorporateGroup(
  matrix: RankPayEntry[],
  corporateGroup: string | null | undefined,
  rank: string | null | undefined,
): boolean {
  if (!rank?.trim()) return false;
  const allowed = ranksForCorporateGroup(matrix, corporateGroup);
  const code = rank.trim().toUpperCase();
  return allowed.some((r) => r.rankCode === code);
}

export function findRankPayEntry(
  matrix: RankPayEntry[],
  rank: string | null | undefined,
): RankPayEntry | undefined {
  if (!rank?.trim()) return undefined;
  const code = rank.trim().toUpperCase();
  return matrix.find((r) => r.rankCode === code);
}

/** Current monthly basic: recorded salary, or rank base + (annual increment × completed years). */
export function adjustedMonthlyBasicFromRank(
  matrix: RankPayEntry[],
  rank: string | null | undefined,
  completedYears: number,
  recordedMonthlyBasicLkr?: number | null,
): number {
  const recorded = Number(recordedMonthlyBasicLkr);
  if (Number.isFinite(recorded) && recorded > 0) return Math.round(recorded);

  const entry = findRankPayEntry(matrix, rank);
  if (!entry) return 0;
  const years = Math.max(0, Math.round(completedYears));
  return entry.basicPay + entry.annualIncrement * years;
}
