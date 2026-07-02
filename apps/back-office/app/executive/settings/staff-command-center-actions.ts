'use server';

import {
  isSystemLockedRank,
  type PortalRbacMatrix,
} from '../../../../../packages/portal-rbac';
import type { HeadOfficePortalAuthStatus } from '../../../lib/head-office-portal-auth';
import {
  filterAndSortStaffForCommandCenter,
  MD_PORTAL_COMMAND_CENTER_SINGLETON_RANKS,
  portalSecurityPolicyForRank,
  type MdPortalCommandCenterRank,
  type PortalSecurityPolicy,
} from '../../../lib/md-portal-staff-command-center-spec';
import {
  getExecutiveRolesPayload,
  type ExecutiveRolesPayload,
} from './executive-role-actions';
import { getRbacMatrixPayload } from './rbac-actions';

const EMPTY_PORTAL_AUTH: HeadOfficePortalAuthStatus = {
  isProvisioned: false,
  isActive: false,
  twoFactorEnabled: false,
  isUsernameLocked: false,
  loginUsername: null,
  lastOtpProvisionedAt: null,
  lastOtpProvisionedByName: null,
  lastOtpProvisionedLocationLabel: null,
  recoveryEmail: null,
  recoveryEmailVerifiedAt: null,
};

export type StaffCommandCenterStaffRow = {
  id: string;
  fullName: string;
  rank: string | null;
  email: string | null;
  status: string;
  isLocked: boolean;
  portalAuth: HeadOfficePortalAuthStatus;
  securityPolicy: PortalSecurityPolicy;
};

export type StaffCommandCenterPayload = {
  executiveRoles: ExecutiveRolesPayload;
  /** Active employees with MD Portal command-center ranks (column view). */
  staff: StaffCommandCenterStaffRow[];
  /** Singleton MD / OD / FM slots with no holder — render vacant column (Step 01). */
  vacantSingletonRanks: MdPortalCommandCenterRank[];
  matrix: PortalRbacMatrix;
  portalAuthByEmployeeId: Record<string, HeadOfficePortalAuthStatus>;
  sessionEmployeeId: string | null;
  sessionRole: string | null;
};

function vacantSingletonRanksFromPayload(
  executiveRoles: ExecutiveRolesPayload,
): MdPortalCommandCenterRank[] {
  return executiveRoles.slots
    .filter((slot) => !slot.holder)
    .map((slot) => slot.rankCode)
    .filter((rankCode): rankCode is MdPortalCommandCenterRank =>
      (MD_PORTAL_COMMAND_CENTER_SINGLETON_RANKS as readonly string[]).includes(rankCode),
    );
}

function mapStaffCommandCenterRows(
  staff: Awaited<ReturnType<typeof getRbacMatrixPayload>>['staff'],
  portalAuthByEmployeeId: Record<string, HeadOfficePortalAuthStatus>,
): StaffCommandCenterStaffRow[] {
  const filtered = filterAndSortStaffForCommandCenter(
    staff.map((person) => ({
      id: person.id,
      fullName: person.fullName,
      rank: person.rank,
      email: person.email,
      status: person.status,
    })),
  );

  return filtered.map((person) => ({
    id: person.id,
    fullName: person.fullName,
    rank: person.rank,
    email: person.email ?? null,
    status: person.status ?? 'ACTIVE',
    isLocked: isSystemLockedRank(person.rank),
    portalAuth: portalAuthByEmployeeId[person.id] ?? EMPTY_PORTAL_AUTH,
    securityPolicy: portalSecurityPolicyForRank(person.rank),
  }));
}

/** Single loader for Staff Command Center columns (roles + OTP + RBAC). */
export async function getStaffCommandCenterPayload(): Promise<
  StaffCommandCenterPayload | { error: string }
> {
  const [executiveResult, rbacResult] = await Promise.all([
    getExecutiveRolesPayload(),
    getRbacMatrixPayload(),
  ]);

  if ('error' in executiveResult) {
    return { error: executiveResult.error };
  }

  const staff = mapStaffCommandCenterRows(
    rbacResult.staff,
    rbacResult.portalAuthByEmployeeId,
  );

  return {
    executiveRoles: executiveResult,
    staff,
    vacantSingletonRanks: vacantSingletonRanksFromPayload(executiveResult),
    matrix: rbacResult.matrix,
    portalAuthByEmployeeId: rbacResult.portalAuthByEmployeeId,
    sessionEmployeeId:
      rbacResult.sessionEmployeeId ?? executiveResult.sessionEmployeeId,
    sessionRole: executiveResult.sessionRole,
  };
}

export type {
  ExecutiveRoleCandidate,
  ExecutiveRoleHolder,
  ExecutiveRoleSlot,
  ExecutiveRolesPayload,
} from './executive-role-actions';
