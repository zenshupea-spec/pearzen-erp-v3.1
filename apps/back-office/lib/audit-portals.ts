export type PortalTab = 'md-od' | 'hq-staff' | 'om' | 'cafe';

export const ALL_AUDIT_TABS: PortalTab[] = ['md-od', 'hq-staff', 'om', 'cafe'];

const STAFF_TABS: Partial<Record<string, PortalTab[]>> = {
  FM: ['hq-staff'],
  HR: ['hq-staff'],
  OM: ['om'],
};

/** Tabs visible for a role — executives see every portal; staff see only their own. */
export function auditTabsForRole(role: string): PortalTab[] {
  if (role === 'MD' || role === 'OD') return ALL_AUDIT_TABS;
  return STAFF_TABS[role] ?? [];
}

/** DB portal keys stored on audit_logs.portal for each ledger tab. */
export function portalKeysForTab(tab: PortalTab): string[] {
  switch (tab) {
    case 'hq-staff':
      return ['fm', 'hr', 'hq'];
    case 'om':
      return ['om'];
    case 'cafe':
      return ['cafe'];
    default:
      return [];
  }
}
