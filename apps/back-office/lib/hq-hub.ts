import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';

/** Central cross-portal command nexus (MD/OD + shared HQ modules). */
export const HQ_HUB_PATH = '/dashboard';

/** WFM-only workforce hub (HR + FM + attendance). */
export const WFM_HUB_PATH = '/wfm';

/** MD/OD Executive Desk home — CV Operations live field radar. */
export const EXECUTIVE_DESK_PATH = '/executive/operations';

export function canAccessExecutiveDesk(role: string | null | undefined): boolean {
  return isExecutiveRank(role);
}

/** HQ Staff ranks that land on /dashboard after sign-in. */
export const HQ_HUB_ACCESS_ROLES = ['HR', 'FM', 'EA'] as const;

export function canAccessHqHub(role: string | null | undefined): boolean {
  const normalized = normalizePortalRole(role);
  if (!normalized) return false;
  if (isExecutiveRank(normalized)) return true;
  return (HQ_HUB_ACCESS_ROLES as readonly string[]).includes(normalized);
}

/** CV Operations opened from HQ Master Hub. */
export const OM_HUB_ENTRY_PATH = '/om?hub=1';

export function isFromHqHub(search: string | URLSearchParams | null | undefined): boolean {
  if (!search) return false;
  if (typeof search === 'string') return search.includes('hub=1');
  return search.get('hub') === '1';
}

export function withHubEntry(path: string): string {
  const [base, query] = path.split('?');
  const params = new URLSearchParams(query ?? '');
  params.set('hub', '1');
  return `${base}?${params.toString()}`;
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
