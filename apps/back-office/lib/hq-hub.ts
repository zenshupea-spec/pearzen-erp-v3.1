import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';

/** Central cross-portal command nexus (MD/OD + shared HQ modules). */
export const HQ_HUB_PATH = '/dashboard';

/** MD/OD Executive Vault home — finance radar and enterprise performance. */
export const EXECUTIVE_DESK_PATH = '/executive/finance';

export function canAccessExecutiveDesk(role: string | null | undefined): boolean {
  return isExecutiveRank(role);
}

/** Ranks that may open the HQ Hub nexus (/dashboard). OM and TM use their own portals only. */
export const HQ_HUB_ACCESS_ROLES = ['MD', 'OD', 'HR', 'FM'] as const;

export function canAccessHqHub(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  return (
    normalized !== null &&
    (HQ_HUB_ACCESS_ROLES as readonly string[]).includes(normalized)
  );
}

/** Café backoffice opened from HQ Hub (or by non-executive HQ staff). */
export const CAFE_BACKOFFICE_PATH = '/executive/cafe';
export const CAFE_INGREDIENTS_PATH = '/executive/cafe/ingredients';
export const CAFE_EXPIRY_PATH = '/executive/cafe/expiry';
export const CAFE_MENU_PATH = '/executive/cafe/menu';
export const CAFE_HUB_ENTRY_PATH = '/executive/cafe?hub=1';

export function canAccessCafeBackoffice(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  if (!normalized) return false;
  return isExecutiveRank(normalized) || normalized === 'HR' || normalized === 'FM';
}

/** Hub-style café view: no MD executive sidebar or payroll/theft executive metrics. */
export function isCafeHubView(
  role: string | null | undefined,
  fromHub: boolean,
): boolean {
  if (fromHub) return true;
  return !isExecutiveRank(role);
}
