export const CAFE_FRONT_COMPLIANCE_PATH = '/cafe-front';
export const CAFE_FRONT_ORDERS_PATH = '/cafe-front/orders';
export const CAFE_FRONT_ROSTER_PATH = '/cafe-front/roster';
export const CAFE_FRONT_EXPIRY_PATH = '/cafe-front/expiry';
export const CAFE_FRONT_MENU_PATH = '/cafe-front/menu';
export const CAFE_FRONT_CHECKIN_PATH = '/cafe-front/check-in';

export const CAFE_FRONT_PORTAL_TABS = [
  { href: CAFE_FRONT_COMPLIANCE_PATH, label: 'Compliance Desk' },
  { href: CAFE_FRONT_ORDERS_PATH, label: 'Order Queue' },
  { href: CAFE_FRONT_ROSTER_PATH, label: 'My Roster' },
  { href: CAFE_FRONT_EXPIRY_PATH, label: 'Expiry Lots' },
  { href: CAFE_FRONT_MENU_PATH, label: 'Menu Requests' },
] as const;
