export type PortalTab =
  | 'md-od'
  | 'hq-staff'
  | 'om'
  | 'tm'
  | 'sm'
  | 'checkin'
  | 'invoice'
  | 'cafe'
  | 'cafe-front';

/** Staff portal tabs shown in the HQ Portal Activity Ledger (no executive vault). */
export const PORTAL_ACTIVITY_TABS: PortalTab[] = [
  'hq-staff',
  'om',
  'tm',
  'sm',
  'checkin',
  'invoice',
  'cafe',
  'cafe-front',
];

/** Full tab set for the MD Executive Vault Master Audit Ledger. */
export const ALL_AUDIT_TABS: PortalTab[] = ['md-od', ...PORTAL_ACTIVITY_TABS];

export const PORTAL_ACTIVITY_LEDGER_ROLES = ['MD', 'OD', 'FM', 'EA'] as const;

export function canAccessPortalActivityLedger(
  role: string | null | undefined,
): boolean {
  if (!role) return false;
  const normalized = role.trim().toUpperCase();
  return (PORTAL_ACTIVITY_LEDGER_ROLES as readonly string[]).includes(normalized);
}

/** Tabs visible on /hq/audit — privileged governance roles see every staff portal. */
export function portalActivityTabsForRole(role: string): PortalTab[] {
  if (canAccessPortalActivityLedger(role)) return PORTAL_ACTIVITY_TABS;
  return [];
}

/** Tabs visible on /executive/audit — executives see every portal including the vault. */
export function auditTabsForRole(role: string): PortalTab[] {
  if (role === 'MD' || role === 'OD') return ALL_AUDIT_TABS;
  return portalActivityTabsForRole(role);
}

/** DB portal keys stored on audit_logs.portal for each ledger tab. */
export function portalKeysForTab(tab: PortalTab): string[] {
  switch (tab) {
    case 'hq-staff':
      return ['fm', 'hr', 'hq'];
    case 'om':
      return ['om'];
    case 'tm':
      return ['tm'];
    case 'sm':
      return ['sm'];
    case 'checkin':
      return ['field', 'guard', 'checkin'];
    case 'invoice':
      return ['invoice'];
    case 'cafe':
      return ['cafe'];
    case 'cafe-front':
      return ['cafe-front'];
    default:
      return [];
  }
}
