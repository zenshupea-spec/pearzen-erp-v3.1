import type { MonthlySiteShiftRollup } from './monthly-site-shifts';

export type SiteFoodSettings = {
  providesFood: boolean;
  allowanceLkr: number;
};

/** siteKey (lowercase trimmed name) → meal allowance settings */
export type SiteFoodByKey = Map<string, SiteFoodSettings>;

export function siteFoodByKeyFromProfiles(
  sites: { site_name: string; provides_food?: boolean | null; food_allowance_lkr?: number | null }[],
): SiteFoodByKey {
  const map = new Map<string, SiteFoodSettings>();
  for (const s of sites) {
    const key = s.site_name.trim().toLowerCase();
    if (!key) continue;
    map.set(key, {
      providesFood: Boolean(s.provides_food),
      allowanceLkr: Math.max(0, Number(s.food_allowance_lkr ?? 0)),
    });
  }
  return map;
}

/** Sum shift count × site food allowance across all sites for each employee. */
export function computeMonthMealCostByEmployee(
  shiftRollup: MonthlySiteShiftRollup,
  siteFoodByKey: SiteFoodByKey,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const [siteKey, countsByEmployee] of shiftRollup.shiftCountBySite) {
    const food = siteFoodByKey.get(siteKey);
    if (!food?.providesFood || food.allowanceLkr <= 0) continue;

    for (const [employeeId, shiftCount] of countsByEmployee) {
      if (shiftCount < 1) continue;
      totals.set(
        employeeId,
        (totals.get(employeeId) ?? 0) + shiftCount * food.allowanceLkr,
      );
    }
  }

  return totals;
}
