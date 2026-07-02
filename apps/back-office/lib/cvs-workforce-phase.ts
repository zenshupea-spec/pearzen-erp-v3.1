/** When true, MNR only allows HEAD_OFFICE and CAFE corporate groups. */
export const CVS_INTERNAL_WORKFORCE_ONLY = false;

/**
 * Guard field ops backend (field radar, site allocation, guard vacancies, FM guard cohorts).
 * Auto-off while {@link CVS_INTERNAL_WORKFORCE_ONLY} is on. Phase-2: set internal flag false
 * to restore guard ops without editing this export directly.
 */
export const CVS_GUARD_OPS_ENABLED = !CVS_INTERNAL_WORKFORCE_ONLY;

/** Shown on guard vacancy surfaces while field ops are paused. */
export const CVS_GUARD_OPS_PAUSED_NOTE =
  'Guard field operations are paused. Head Office and café staffing only.';

const INTERNAL_WORKFORCE_GROUPS = new Set(["HEAD_OFFICE", "CAFE"]);
const PAUSED_GUARD_GROUPS = new Set(["GUARD", "GUARD_FIELD", "SECTOR_MANAGER"]);

function normalizeCorporateGroupForPhase(group: string | null | undefined): string {
  const v = String(group ?? "").trim().toUpperCase();
  return v === "GUARD_FIELD" ? "GUARD" : v;
}

export function isPausedGuardCorporateGroup(group: string | null | undefined): boolean {
  const normalized = normalizeCorporateGroupForPhase(group);
  return PAUSED_GUARD_GROUPS.has(normalized);
}

/** Reject guard / sector-manager groups while internal workforce phase is on. */
export function assertInternalWorkforceCorporateGroup(
  group: string | null | undefined,
): void {
  if (!CVS_INTERNAL_WORKFORCE_ONLY) return;

  const normalized = normalizeCorporateGroupForPhase(group);
  if (!normalized) return;

  if (isPausedGuardCorporateGroup(normalized)) {
    throw new Error(
      "Guard and sector manager groups are paused. Use Head Office or Café only until field ops return.",
    );
  }
  if (!INTERNAL_WORKFORCE_GROUPS.has(normalized)) {
    throw new Error(
      `Corporate group "${normalized}" cannot be saved during internal workforce setup. Only Head Office and Café are allowed.`,
    );
  }
}
