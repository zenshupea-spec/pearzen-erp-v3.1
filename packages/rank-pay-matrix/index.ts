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

/** MD / OD are system Head Office ranks — always present in the ledger and cannot be removed. */
export const LOCKED_EXECUTIVE_LEDGER_RANKS: RankPayEntry[] = [
  {
    id: 'rp-locked-md',
    rankCode: 'MD',
    fullTitle: 'MANAGING DIRECTOR',
    basicPay: 0,
    annualIncrement: 0,
    salaryType: 'BANK',
    operationalGroup: 'HEAD_OFFICE',
  },
  {
    id: 'rp-locked-od',
    rankCode: 'OD',
    fullTitle: 'OPERATIONS DEVELOPER',
    basicPay: 0,
    annualIncrement: 0,
    salaryType: 'BANK',
    operationalGroup: 'HEAD_OFFICE',
  },
];

/** SM is always available for Sector Manager induction — same ledger section as HO. */
export const LOCKED_SECTOR_MANAGER_LEDGER_RANK: RankPayEntry = {
  id: 'rp-locked-sm',
  rankCode: 'SM',
  fullTitle: 'SECTOR MANAGER',
  basicPay: 0,
  annualIncrement: 0,
  salaryType: 'BANK',
  operationalGroup: 'SECTOR_MANAGER',
};

export function isLockedExecutiveLedgerRank(rankCode: string | null | undefined): boolean {
  const code = (rankCode || '').trim().toUpperCase();
  return code === 'MD' || code === 'OD';
}

/** Re-insert MD / OD when missing from a saved matrix (e.g. after manual delete or legacy data). */
export function ensureLockedExecutiveLedgerRanks(matrix: RankPayEntry[]): RankPayEntry[] {
  const present = new Set(matrix.map((entry) => entry.rankCode.trim().toUpperCase()));
  const missing = LOCKED_EXECUTIVE_LEDGER_RANKS.filter(
    (entry) => !present.has(entry.rankCode),
  );
  if (missing.length === 0) return matrix;
  return [...matrix, ...missing.map((entry) => ({ ...entry }))];
}

export function isLockedSectorManagerLedgerRank(rankCode: string | null | undefined): boolean {
  return (rankCode || '').trim().toUpperCase() === 'SM';
}

/** Re-insert SM when missing (Sector Manager induction under Head Office). */
export function ensureLockedSectorManagerLedgerRank(matrix: RankPayEntry[]): RankPayEntry[] {
  if (matrix.some((entry) => isLockedSectorManagerLedgerRank(entry.rankCode))) {
    return matrix;
  }
  return [...matrix, { ...LOCKED_SECTOR_MANAGER_LEDGER_RANK }];
}

/** Full matrix with system HO ranks (MD, OD, SM) guaranteed for reads and saves. */
export function ensureSystemLedgerRanks(matrix: RankPayEntry[]): RankPayEntry[] {
  return ensureLockedSectorManagerLedgerRank(ensureLockedExecutiveLedgerRanks(matrix));
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

/** Normalize rank rows before persisting (matches server save rules). */
export function sanitizeRankPayMatrixEntries(matrix: RankPayEntry[]): RankPayEntry[] {
  const sanitized = matrix
    .map((entry) => {
      const isGuardRank =
        entry.operationalGroup === 'GUARD_FIELD' || entry.operationalGroup === 'GUARD';
      return {
        id: entry.id,
        rankCode: entry.rankCode.trim().toUpperCase().slice(0, 12),
        fullTitle: entry.fullTitle.trim().toUpperCase(),
        basicPay: isGuardRank ? Math.max(0, Math.round(entry.basicPay)) : 0,
        annualIncrement: isGuardRank
          ? Math.max(0, Math.round(entry.annualIncrement ?? 0))
          : 0,
        salaryType: entry.salaryType === 'CASH' ? 'CASH' : 'BANK',
        operationalGroup: entry.operationalGroup,
      };
    })
    .filter((entry) => entry.rankCode.length > 0 && entry.fullTitle.length > 0);
  return ensureSystemLedgerRanks(sanitized);
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

/** MD / OD / FM — one active portal holder each; not assignable via HR induction or MNR picker. */
export const SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS = ['MD', 'OD', 'FM'] as const;

export type SingletonHrAssignablePortalRank =
  (typeof SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS)[number];

const SINGLETON_PORTAL_RANK_SET = new Set<string>(
  SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS,
);

export function isSingletonHrAssignablePortalRank(
  rankCode: string | null | undefined,
): boolean {
  const code = (rankCode || '').trim().toUpperCase();
  return SINGLETON_PORTAL_RANK_SET.has(code);
}

export type HrAssignmentSelectOptions = {
  /** Extra rank codes to hide (e.g. occupied singleton portal slots). */
  excludeRankCodes?: readonly string[];
};

const HEAD_OFFICE_HR_OPERATIONAL_GROUPS: OperationalGroup[] = [
  'HEAD_OFFICE',
  'SECTOR_MANAGER',
];

function filterHrAssignmentRanks(
  saved: RankPayEntry[],
  opts?: HrAssignmentSelectOptions,
): RankPayEntry[] {
  const excluded = new Set<string>([
    ...SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS,
    ...(opts?.excludeRankCodes ?? []).map((code) => code.trim().toUpperCase()),
  ]);
  return saved
    .filter((entry) => !excluded.has(entry.rankCode.trim().toUpperCase()))
    .sort(
      (a, b) =>
        rankSortIndex(saved, a.rankCode) - rankSortIndex(saved, b.rankCode),
    );
}

/**
 * Head Office HR rank dropdown — saved matrix rows under HO and SM ledger sections.
 * Includes SM (operationalGroup SECTOR_MANAGER) so SMs induct under Head Office group.
 */
export function ranksForHeadOfficeHrAssignmentSelect(
  matrix: RankPayEntry[],
  opts?: HrAssignmentSelectOptions,
): RankPayEntry[] {
  const ledgerMatrix = ensureSystemLedgerRanks(matrix);
  const saved = ledgerMatrix.filter((entry) =>
    HEAD_OFFICE_HR_OPERATIONAL_GROUPS.includes(entry.operationalGroup),
  );
  return filterHrAssignmentRanks(saved, opts);
}

/**
 * HR induction / MNR rank dropdown — saved md_settings matrix only for the corporate
 * group. Does not merge DEFAULT_RANK_PAY_MATRIX, locked MD/OD, or locked SM.
 */
export function ranksForHrAssignmentSelect(
  matrix: RankPayEntry[],
  corporateGroup: string | null | undefined,
  opts?: HrAssignmentSelectOptions,
): RankPayEntry[] {
  const key = (corporateGroup || '').trim().toUpperCase();
  if (key === 'HEAD_OFFICE') {
    return ranksForHeadOfficeHrAssignmentSelect(matrix, opts);
  }
  const saved = ranksForCorporateGroup(matrix, corporateGroup);
  return filterHrAssignmentRanks(saved, opts);
}

export function isRankValidForHrAssignment(
  matrix: RankPayEntry[],
  corporateGroup: string | null | undefined,
  rank: string | null | undefined,
  opts?: HrAssignmentSelectOptions,
): boolean {
  if (!rank?.trim()) return false;
  const code = rank.trim().toUpperCase();
  if (isSingletonHrAssignablePortalRank(code)) return false;
  const allowed = ranksForHrAssignmentSelect(matrix, corporateGroup, opts);
  return allowed.some((entry) => entry.rankCode === code);
}

/** Predefined guard/HO/café ranks plus any saved in md_settings — for HR MNR rank dropdown. */
export function mergeRankOptionsForCorporateGroup(
  matrix: RankPayEntry[],
  corporateGroup: string | null | undefined,
): RankPayEntry[] {
  const predefined = ranksForCorporateGroup(DEFAULT_RANK_PAY_MATRIX, corporateGroup);
  const saved = ranksForCorporateGroup(matrix, corporateGroup);
  const key = (corporateGroup || '').trim().toUpperCase() as CorporateGroup;
  const lockedExecutive = key === 'HEAD_OFFICE' ? LOCKED_EXECUTIVE_LEDGER_RANKS : [];
  const lockedSm = key === 'SECTOR_MANAGER' ? [LOCKED_SECTOR_MANAGER_LEDGER_RANK] : [];
  const byCode = new Map<string, RankPayEntry>();
  for (const entry of predefined) {
    byCode.set(entry.rankCode, entry);
  }
  for (const entry of lockedExecutive) {
    byCode.set(entry.rankCode, entry);
  }
  for (const entry of lockedSm) {
    byCode.set(entry.rankCode, entry);
  }
  for (const entry of saved) {
    byCode.set(entry.rankCode, entry);
  }
  return Array.from(byCode.values()).sort(
    (a, b) => rankSortIndex([...predefined, ...saved], a.rankCode) - rankSortIndex([...predefined, ...saved], b.rankCode),
  );
}

export function defaultOperationalGroupForCorporateGroup(
  corporateGroup: string | null | undefined,
): OperationalGroup {
  const key = (corporateGroup || '').trim().toUpperCase();
  if (key === 'HEAD_OFFICE') return 'HEAD_OFFICE';
  if (key === 'CAFE') return 'CAFE';
  if (key === 'SECTOR_MANAGER') return 'SECTOR_MANAGER';
  return 'GUARD_FIELD';
}

/** MD Settings ledger sections — HR may only assign ranks listed under these groups. */
export type RankLedgerSectionId = 'HEAD_OFFICE' | 'GUARD' | 'CAFE';

export const RANK_LEDGER_SECTIONS: {
  id: RankLedgerSectionId;
  label: string;
  description: string;
  operationalGroups: OperationalGroup[];
  defaultOperationalGroup: OperationalGroup;
  /** Guard ranks use ledger basic pay; HO / café / SM titles do not. */
  showRankPayAmounts: boolean;
}[] = [
  {
    id: 'HEAD_OFFICE',
    label: 'Head Office',
    description:
      'HO and Sector Manager ranks — pay is set per employee in MNR, not from rank base pay here.',
    operationalGroups: ['HEAD_OFFICE', 'SECTOR_MANAGER'],
    defaultOperationalGroup: 'HEAD_OFFICE',
    showRankPayAmounts: false,
  },
  {
    id: 'GUARD',
    label: 'Guards (Field Operations)',
    description: 'Field guard ranks — base monthly pay and annual increment apply per rank.',
    operationalGroups: ['GUARD_FIELD', 'GUARD'],
    defaultOperationalGroup: 'GUARD_FIELD',
    showRankPayAmounts: true,
  },
  {
    id: 'CAFE',
    label: 'Café Operations',
    description:
      'Café staff ranks — pay is set per employee in MNR, not from rank base pay here.',
    operationalGroups: ['CAFE'],
    defaultOperationalGroup: 'CAFE',
    showRankPayAmounts: false,
  },
];

export function ranksForLedgerSection(
  matrix: RankPayEntry[],
  sectionId: RankLedgerSectionId,
): RankPayEntry[] {
  const section = RANK_LEDGER_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return [];
  const ops = new Set(section.operationalGroups);
  return matrix.filter((r) => ops.has(r.operationalGroup));
}

const CORPORATE_GROUP_LEDGER_SECTION: Partial<
  Record<CorporateGroup, RankLedgerSectionId>
> = {
  GUARD: 'GUARD',
  HEAD_OFFICE: 'HEAD_OFFICE',
  SECTOR_MANAGER: 'HEAD_OFFICE',
  CAFE: 'CAFE',
};

/**
 * All ranks shown in MD Settings for this corporate group — used to populate HR
 * rank pickers. Includes MD / OD / FM / SM (system ranks) even when HR cannot assign them.
 */
export function ranksForHrRankPickerOptions(
  matrix: RankPayEntry[],
  corporateGroup: string | null | undefined,
): RankPayEntry[] {
  const key = (corporateGroup || '').trim().toUpperCase() as CorporateGroup;
  const sectionId = CORPORATE_GROUP_LEDGER_SECTION[key];
  if (!sectionId) return [];
  const ledgerMatrix = ensureSystemLedgerRanks(matrix);
  const sectionRanks = ranksForLedgerSection(ledgerMatrix, sectionId);
  return [...sectionRanks].sort(
    (a, b) =>
      rankSortIndex(ledgerMatrix, a.rankCode) - rankSortIndex(ledgerMatrix, b.rankCode),
  );
}

/** Whether HR may select this rank in onboarding / MNR (server validation uses this). */
export function isHrRankSelectableInPicker(
  matrix: RankPayEntry[],
  corporateGroup: string | null | undefined,
  rankCode: string | null | undefined,
  opts?: HrAssignmentSelectOptions,
): boolean {
  if (!rankCode?.trim()) return false;
  const code = rankCode.trim().toUpperCase();
  return ranksForHrAssignmentSelect(matrix, corporateGroup, opts).some(
    (entry) => entry.rankCode === code,
  );
}

export function ledgerSectionForOperationalGroup(
  operationalGroup: OperationalGroup,
): RankLedgerSectionId | null {
  const match = RANK_LEDGER_SECTIONS.find((section) =>
    section.operationalGroups.includes(operationalGroup),
  );
  return match?.id ?? null;
}

export const OPERATIONAL_GROUP_LABELS: Record<OperationalGroup, string> = {
  HEAD_OFFICE: 'Head Office',
  GUARD_FIELD: 'Field Operations',
  GUARD: 'Guard',
  CAFE: 'Café Operations',
  SECTOR_MANAGER: 'Sector Manager',
};

export function operationalGroupsForLedgerSection(
  sectionId: RankLedgerSectionId,
): OperationalGroup[] {
  return (
    RANK_LEDGER_SECTIONS.find((section) => section.id === sectionId)
      ?.operationalGroups ?? []
  );
}

export function isRankValidForCorporateGroup(
  matrix: RankPayEntry[],
  corporateGroup: string | null | undefined,
  rank: string | null | undefined,
): boolean {
  if (!rank?.trim()) return false;
  const allowed = mergeRankOptionsForCorporateGroup(matrix, corporateGroup);
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
