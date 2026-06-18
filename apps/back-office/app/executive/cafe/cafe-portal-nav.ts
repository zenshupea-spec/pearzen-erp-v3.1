export const CAFE_COMPLIANCE_PATH = '/executive/cafe';
export const CAFE_INGREDIENTS_PATH = '/executive/cafe/ingredients';
export const CAFE_EXPIRY_PATH = '/executive/cafe/expiry';
export const CAFE_MENU_PATH = '/executive/cafe/menu';
export const CAFE_CUSTOMERS_PATH = '/executive/cafe/customers';

export function cafePortalHref(
  path: string,
  hubView: boolean,
  branchId?: string | null,
): string {
  const params = new URLSearchParams();
  if (hubView) params.set('hub', '1');
  if (branchId) params.set('branch', branchId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const CAFE_PORTAL_TABS = [
  { href: CAFE_COMPLIANCE_PATH, label: 'Compliance Desk' },
  { href: CAFE_INGREDIENTS_PATH, label: 'Ingredients Ledger' },
  { href: CAFE_EXPIRY_PATH, label: 'Expiry Tracking' },
  { href: CAFE_MENU_PATH, label: 'Menu & Pricing' },
  { href: CAFE_CUSTOMERS_PATH, label: 'Customers' },
] as const;
