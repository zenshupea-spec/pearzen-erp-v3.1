import { accessLevelAllows, type PortalAccessLevel } from '../../../packages/portal-rbac';

export type PortalTab =
  | 'md-od'
  | 'security'
  | 'hq-staff'
  | 'om'
  | 'tm'
  | 'sm'
  | 'checkin'
  | 'invoice'
  | 'cafe'
  | 'cafe-front'
  | 'shalom-front';

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
  'shalom-front',
];

/** Full tab set for the MD Executive Vault Master Audit Ledger. */
export const ALL_AUDIT_TABS: PortalTab[] = ['md-od', 'security', ...PORTAL_ACTIVITY_TABS];

export const PORTAL_ACTIVITY_LEDGER_ROLES = ['MD', 'OD', 'FM', 'EA'] as const;

export function canAccessExecutiveAuditVault(
  role: string | null | undefined,
): boolean {
  if (!role) return false;
  const normalized = role.trim().toUpperCase();
  return normalized === 'MD' || normalized === 'OD';
}

export function canAccessPortalActivityLedger(
  role: string | null | undefined,
): boolean {
  if (!role) return false;
  const normalized = role.trim().toUpperCase();
  return (PORTAL_ACTIVITY_LEDGER_ROLES as readonly string[]).includes(normalized);
}

/** Tabs visible on /hq/audit — governance roles see staff portals; MD/OD also see vault + security. */
export function portalActivityTabsForRole(role: string): PortalTab[] {
  const staffTabs = canAccessPortalActivityLedger(role) ? [...PORTAL_ACTIVITY_TABS] : [];
  if (canAccessExecutiveAuditVault(role)) {
    return ['md-od', 'security', ...staffTabs];
  }
  return staffTabs;
}

/** RBAC-gated staff with audit_ledger READ/FULL see staff portal tabs only. */
export function portalActivityTabsForRbacGated(
  portalRbac: Record<string, PortalAccessLevel> | null | undefined,
): PortalTab[] {
  if (!accessLevelAllows(portalRbac?.audit_ledger)) return [];
  return [...PORTAL_ACTIVITY_TABS];
}

/** Tabs visible on /executive/audit — executives see every portal including the vault. */
export function auditTabsForRole(role: string): PortalTab[] {
  if (canAccessExecutiveAuditVault(role)) return ALL_AUDIT_TABS;
  return portalActivityTabsForRole(role);
}

export type AuditLedgerProfile = {
  role?: string | null;
  rbacGated?: boolean;
  portalRbac?: Record<string, PortalAccessLevel> | null;
};

export function canAccessHqAuditRoute(profile: AuditLedgerProfile): boolean {
  if (profile.role && canAccessPortalActivityLedger(profile.role)) return true;
  if (profile.rbacGated) {
    return accessLevelAllows(profile.portalRbac?.audit_ledger);
  }
  return false;
}

export function canFetchAuditLedgerTab(
  portalTab: PortalTab,
  profile: AuditLedgerProfile,
): boolean {
  if (portalTab === 'md-od' || portalTab === 'security') {
    return canAccessExecutiveAuditVault(profile.role);
  }
  return canAccessHqAuditRoute(profile);
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
    case 'shalom-front':
      return ['shalom-front'];
    case 'md-od':
    case 'security':
      return [];
    default:
      return [];
  }
}
