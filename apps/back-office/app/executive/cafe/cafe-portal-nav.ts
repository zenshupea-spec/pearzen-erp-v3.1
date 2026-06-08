export const CAFE_COMPLIANCE_PATH = '/executive/cafe';
export const CAFE_INGREDIENTS_PATH = '/executive/cafe/ingredients';
export const CAFE_EXPIRY_PATH = '/executive/cafe/expiry';
export const CAFE_MENU_PATH = '/executive/cafe/menu';

export function cafePortalHref(path: string, hubView: boolean): string {
  return hubView ? `${path}?hub=1` : path;
}

export const CAFE_PORTAL_TABS = [
  { href: CAFE_COMPLIANCE_PATH, label: 'Compliance Desk' },
  { href: CAFE_INGREDIENTS_PATH, label: 'Ingredients Ledger' },
  { href: CAFE_EXPIRY_PATH, label: 'Expiry Tracking' },
  { href: CAFE_MENU_PATH, label: 'Menu & Pricing' },
] as const;
