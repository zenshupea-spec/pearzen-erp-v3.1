export const CAFE_COMPLIANCE_PATH = '/executive/cafe';
export const CAFE_FLOAT_PATH = '/executive/cafe/float';
export const CAFE_INVENTORY_PATH = '/executive/cafe/inventory';
export const CAFE_INGREDIENTS_PATH = '/executive/cafe/ingredients';
export const CAFE_EXPIRY_PATH = '/executive/cafe/expiry';
export const CAFE_MENU_PATH = '/executive/cafe/menu';
export const CAFE_CUSTOMERS_PATH = '/executive/cafe/customers';

/** Compliance Desk section anchors (inventory lives on the main page). */
export const CAFE_INVENTORY_ANCHOR = 'cafe-inventory';

export function cafePortalHref(
  path: string,
  hubView: boolean,
  branchId?: string | null,
  anchor?: string,
): string {
  const params = new URLSearchParams();
  if (hubView) params.set('hub', '1');
  if (branchId) params.set('branch', branchId);
  const query = params.toString();
  const base = query ? `${path}?${query}` : path;
  return anchor ? `${base}#${anchor}` : base;
}

export function cafeComplianceSectionHref(
  anchor: string,
  hubView: boolean,
  branchId?: string | null,
): string {
  return cafePortalHref(CAFE_COMPLIANCE_PATH, hubView, branchId, anchor);
}

/** Deep-link to a single ingredient row on the ledger (expand + scroll). */
export function cafeIngredientLedgerHref(
  ingredientId: string,
  hubView: boolean,
  branchId?: string | null,
): string {
  const params = new URLSearchParams();
  if (hubView) params.set('hub', '1');
  if (branchId) params.set('branch', branchId);
  params.set('ingredient', ingredientId);
  return `${CAFE_INGREDIENTS_PATH}?${params.toString()}`;
}

export const CAFE_PORTAL_TABS = [
  { href: CAFE_COMPLIANCE_PATH, label: 'Compliance Desk' },
  { href: CAFE_FLOAT_PATH, label: 'Cash Float' },
  {
    href: CAFE_INVENTORY_PATH,
    label: 'Inventory',
    complianceAnchor: CAFE_INVENTORY_ANCHOR,
  },
  { href: CAFE_INGREDIENTS_PATH, label: 'Ingredients Ledger' },
  { href: CAFE_EXPIRY_PATH, label: 'Expiry Tracking' },
  { href: CAFE_MENU_PATH, label: 'Menu & Pricing' },
  { href: CAFE_CUSTOMERS_PATH, label: 'Customers' },
] as const;
