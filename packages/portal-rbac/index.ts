export type PortalAccessLevel = 'FULL' | 'READ' | 'NONE';

export type PortalRbacPortalId =
  | 'om_command'
  | 'tm_command'
  | 'sm_portal'
  | 'checkin_app'
  | 'finance'
  | 'deductions'
  | 'invoice_desk'
  | 'hr_desk'
  | 'vacancies'
  | 'client_portal'
  | 'cafe'
  | 'audit_ledger';

export interface PortalRbacPortalDef {
  id: PortalRbacPortalId;
  label: string;
  sub: string;
  section: string;
}

export const PORTAL_RBAC_PORTALS: PortalRbacPortalDef[] = [
  { id: 'om_command', label: 'OM Command Center', sub: 'Field & Scheduling', section: 'Field Operations' },
  { id: 'tm_command', label: 'TM Command Center', sub: 'Territory Oversight', section: 'Field Operations' },
  { id: 'sm_portal', label: 'SM Portal', sub: 'Sector Management', section: 'Field Operations' },
  { id: 'checkin_app', label: 'Check-in App', sub: 'Attendance Stream', section: 'Field Operations' },
  { id: 'finance', label: 'Finance & Payroll', sub: 'Payroll Processing', section: 'Finance & Billing' },
  { id: 'deductions', label: 'Deductions Admin', sub: 'Payroll Lock', section: 'Finance & Billing' },
  { id: 'invoice_desk', label: 'Invoice Desk', sub: 'Invoices / Payables', section: 'Finance & Billing' },
  { id: 'hr_desk', label: 'HR Operations Desk', sub: 'Staff & Payroll', section: 'HR & Workforce' },
  { id: 'vacancies', label: 'Open Vacancies & Ads', sub: 'Recruitment', section: 'HR & Workforce' },
  { id: 'client_portal', label: 'Client Portal', sub: 'Client-facing View', section: 'Auxiliary & Governance' },
  { id: 'cafe', label: 'Café Backoffice', sub: 'Hospitality Portal', section: 'Auxiliary & Governance' },
  { id: 'audit_ledger', label: 'Master Audit Ledger', sub: 'Audit Trail', section: 'Auxiliary & Governance' },
];

export const PORTAL_RBAC_PORTAL_IDS = PORTAL_RBAC_PORTALS.map((p) => p.id);

export type PortalRbacMatrix = Record<string, Record<string, PortalAccessLevel>>;

export interface HeadOfficeRbacStaffRow {
  id: string;
  fullName: string;
  rank: string | null;
  email: string | null;
  status: string;
}

const VALID_LEVELS = new Set<string>(['FULL', 'READ', 'NONE']);

export function makeBlankPortalRbacRow(): Record<PortalRbacPortalId, PortalAccessLevel> {
  return Object.fromEntries(
    PORTAL_RBAC_PORTAL_IDS.map((id) => [id, 'NONE']),
  ) as Record<PortalRbacPortalId, PortalAccessLevel>;
}

export function parsePortalRbacMatrix(raw: unknown): PortalRbacMatrix {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: PortalRbacMatrix = {};
  for (const [employeeId, portals] of Object.entries(raw as Record<string, unknown>)) {
    if (!employeeId.trim() || !portals || typeof portals !== 'object' || Array.isArray(portals)) {
      continue;
    }
    const row: Record<string, PortalAccessLevel> = {};
    for (const portalId of PORTAL_RBAC_PORTAL_IDS) {
      const val = (portals as Record<string, unknown>)[portalId];
      row[portalId] =
        typeof val === 'string' && VALID_LEVELS.has(val)
          ? (val as PortalAccessLevel)
          : 'NONE';
    }
    out[employeeId] = row;
  }
  return out;
}

export function sanitizePortalRbacMatrix(raw: PortalRbacMatrix): PortalRbacMatrix {
  const out: PortalRbacMatrix = {};
  for (const [employeeId, portals] of Object.entries(raw)) {
    if (!employeeId.trim()) continue;
    out[employeeId] = makeBlankPortalRbacRow();
    for (const portalId of PORTAL_RBAC_PORTAL_IDS) {
      const val = portals?.[portalId];
      out[employeeId][portalId] =
        typeof val === 'string' && VALID_LEVELS.has(val)
          ? (val as PortalAccessLevel)
          : 'NONE';
    }
  }
  return out;
}

export function mergeStaffWithPortalRbac(
  staff: HeadOfficeRbacStaffRow[],
  saved: PortalRbacMatrix,
): PortalRbacMatrix {
  const merged: PortalRbacMatrix = {};
  for (const person of staff) {
    merged[person.id] = {
      ...makeBlankPortalRbacRow(),
      ...(saved[person.id] ?? {}),
    };
  }
  return merged;
}

export function hasAnyPortalAccess(
  row: Record<string, PortalAccessLevel> | undefined,
): boolean {
  if (!row) return false;
  return PORTAL_RBAC_PORTAL_IDS.some((id) => row[id] === 'FULL' || row[id] === 'READ');
}

/** Route prefixes guarded by each RBAC portal column. */
export const PORTAL_RBAC_ROUTE_PREFIXES: Record<PortalRbacPortalId, string[]> = {
  om_command: ['/om'],
  tm_command: ['/tm'],
  sm_portal: [],
  checkin_app: ['/hq/guard-proxy'],
  finance: ['/fm', '/fm-dashboard', '/executive/finance'],
  deductions: ['/hq/deductions'],
  invoice_desk: ['/invoice-desk'],
  hr_desk: ['/hr'],
  vacancies: ['/hr/vacancies'],
  client_portal: [],
  cafe: ['/cafe-front', '/executive/cafe'],
  audit_ledger: ['/hq/audit', '/executive/audit'],
};

export function portalForPathname(pathname: string): PortalRbacPortalId | null {
  for (const portalId of PORTAL_RBAC_PORTAL_IDS) {
    const prefixes = PORTAL_RBAC_ROUTE_PREFIXES[portalId];
    for (const prefix of prefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return portalId;
      }
    }
  }
  return null;
}

export function accessLevelAllows(
  level: PortalAccessLevel | undefined,
  writeRequired = false,
): boolean {
  if (!level || level === 'NONE') return false;
  if (writeRequired) return level === 'FULL';
  return level === 'FULL' || level === 'READ';
}

export function canAccessPathViaPortalRbac(
  pathname: string,
  row: Record<string, PortalAccessLevel> | undefined,
  options?: { writeRequired?: boolean },
): boolean {
  const portalId = portalForPathname(pathname);
  if (!portalId) return true;
  return accessLevelAllows(row?.[portalId], options?.writeRequired ?? false);
}

const LANDING_PORTAL_PRIORITY: PortalRbacPortalId[] = [
  'finance',
  'hr_desk',
  'om_command',
  'tm_command',
  'deductions',
  'invoice_desk',
  'vacancies',
  'cafe',
  'audit_ledger',
];

export function landingPathFromPortalRbac(
  row: Record<string, PortalAccessLevel> | undefined,
): string | null {
  if (!row) return null;
  for (const portalId of LANDING_PORTAL_PRIORITY) {
    if (row[portalId] === 'FULL' || row[portalId] === 'READ') {
      const prefixes = PORTAL_RBAC_ROUTE_PREFIXES[portalId];
      if (prefixes[0]) return prefixes[0];
    }
  }
  return null;
}

export function isImmutableExecutiveRank(rank: string | null | undefined): boolean {
  const normalized = (rank || '').trim().toUpperCase();
  return normalized === 'MD' || normalized === 'OD';
}

export function isLockedOmRank(rank: string | null | undefined): boolean {
  return (rank || '').trim().toUpperCase() === 'OM';
}

export function isLockedTmRank(rank: string | null | undefined): boolean {
  return (rank || '').trim().toUpperCase() === 'TM';
}

export function isSystemLockedRank(rank: string | null | undefined): boolean {
  return (
    isImmutableExecutiveRank(rank) ||
    isLockedOmRank(rank) ||
    isLockedTmRank(rank)
  );
}

export function lockedPortalRbacRowForRank(
  rank: string | null | undefined,
): Record<PortalRbacPortalId, PortalAccessLevel> | null {
  if (isImmutableExecutiveRank(rank)) {
    const row = makeBlankPortalRbacRow();
    for (const portalId of PORTAL_RBAC_PORTAL_IDS) {
      row[portalId] = 'FULL';
    }
    return row;
  }
  if (isLockedOmRank(rank)) {
    return { ...makeBlankPortalRbacRow(), om_command: 'FULL' };
  }
  if (isLockedTmRank(rank)) {
    return { ...makeBlankPortalRbacRow(), tm_command: 'FULL' };
  }
  return null;
}
