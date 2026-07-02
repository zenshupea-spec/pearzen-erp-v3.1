import {
  otpExpiresMinutesForRank,
  passwordMinLengthForRank,
  receivesWorkEmailOtpOnProvision,
  usesHrDeskOtpOnProvision,
} from './executive-portal-auth-policy';
import { HO_PORTAL_OTP_LENGTH } from './head-office-portal-password';
import { requiresExecutiveRecoveryEmail } from './head-office-portal-recovery-email';
import type { StaffPortalId } from './portal-isolation';
import { staffPortalIdForRole } from './portal-isolation';
import { isExecutiveRank, normalizePortalRole } from './portal-role-utils';

/** Head Office ranks shown as Staff Command Center employee columns (Step 01 lock). */
export const MD_PORTAL_COMMAND_CENTER_RANKS = [
  'MD',
  'OD',
  'FM',
  'OM',
  'HR',
  'EA',
  'AD',
  'SC',
] as const;

export type MdPortalCommandCenterRank =
  (typeof MD_PORTAL_COMMAND_CENTER_RANKS)[number];

/** Singleton executive ranks — one active holder each. */
export const MD_PORTAL_COMMAND_CENTER_SINGLETON_RANKS = ['MD', 'OD', 'FM'] as const;

/** Per-sector role pickers on Sector Assignments board (Step 01 lock). */
export const SECTOR_ASSIGNMENT_ROLE_CODES = [
  'OM',
  'FM',
  'HR',
  'TM',
  'AD',
  'EA',
] as const;

export type SectorAssignmentRoleCode =
  (typeof SECTOR_ASSIGNMENT_ROLE_CODES)[number];

/** Display titles aligned with CVS MNR rank pay matrix (CVS_REMEDIATION_STEPS.md). */
export const MD_PORTAL_COMMAND_CENTER_RANK_LABELS: Record<
  MdPortalCommandCenterRank,
  string
> = {
  MD: 'Managing Director',
  OD: 'Operations Director',
  FM: 'Finance Manager',
  OM: 'Operations Manager',
  HR: 'Human Resources',
  EA: 'Executive Admin',
  AD: 'Admin',
  SC: 'Security Coordinator',
};

export const SECTOR_ASSIGNMENT_ROLE_LABELS: Record<
  SectorAssignmentRoleCode,
  string
> = {
  OM: MD_PORTAL_COMMAND_CENTER_RANK_LABELS.OM,
  FM: MD_PORTAL_COMMAND_CENTER_RANK_LABELS.FM,
  HR: MD_PORTAL_COMMAND_CENTER_RANK_LABELS.HR,
  TM: 'Training Manager',
  AD: MD_PORTAL_COMMAND_CENTER_RANK_LABELS.AD,
  EA: MD_PORTAL_COMMAND_CENTER_RANK_LABELS.EA,
};

export function commandCenterRankLabel(rank: MdPortalCommandCenterRank): string {
  return MD_PORTAL_COMMAND_CENTER_RANK_LABELS[rank];
}

export function sectorAssignmentRoleLabel(
  roleCode: SectorAssignmentRoleCode,
): string {
  return SECTOR_ASSIGNMENT_ROLE_LABELS[roleCode];
}

export type OtpProvisionChannel = 'email' | 'hr_desk';

export type PortalSecurityPolicy = {
  rank: string | null;
  loginPortal: StaffPortalId | null;
  passwordMinLength: number;
  otpDigits: number;
  otpChannel: OtpProvisionChannel;
  otpLifetimeMinutes: number;
  recoveryEmailRequired: boolean;
  twoFactorRequired: true;
  selfServiceMdRequestCode: boolean;
};

export type StaffCommandCenterRow = {
  id: string;
  fullName: string;
  rank: string | null;
  email?: string | null;
  status?: string;
};

const COMMAND_CENTER_RANK_ORDER: Record<MdPortalCommandCenterRank, number> = {
  MD: 0,
  OD: 1,
  FM: 2,
  OM: 3,
  HR: 4,
  EA: 5,
  AD: 6,
  SC: 7,
};

/** AD / SC sign in at HQ Staff Portal before rank is added to HQ_STAFF_RANKS. */
function isHqPortalCommandCenterRank(rank: string | null | undefined): boolean {
  const normalized = normalizePortalRole(rank);
  return normalized === 'AD' || normalized === 'SC';
}

function resolveLoginPortalForCommandCenterRank(
  rank: string | null | undefined,
): StaffPortalId | null {
  const normalized = normalizePortalRole(rank);
  if (!normalized) return null;
  if (isHqPortalCommandCenterRank(normalized)) return 'hq';
  return staffPortalIdForRole(normalized);
}

function otpChannelForCommandCenterRank(
  rank: string | null | undefined,
): OtpProvisionChannel {
  if (receivesWorkEmailOtpOnProvision(rank)) return 'email';
  if (usesHrDeskOtpOnProvision(rank)) return 'hr_desk';
  if (isHqPortalCommandCenterRank(rank)) return 'hr_desk';
  return 'hr_desk';
}

function passwordMinLengthForCommandCenterRank(
  rank: string | null | undefined,
): number {
  if (isHqPortalCommandCenterRank(rank)) {
    return passwordMinLengthForRank(rank, { rbacGated: true });
  }
  return passwordMinLengthForRank(rank);
}

export function isMdPortalCommandCenterRank(
  rank: string | null | undefined,
): rank is MdPortalCommandCenterRank {
  const normalized = normalizePortalRole(rank);
  if (!normalized) return false;
  return (MD_PORTAL_COMMAND_CENTER_RANKS as readonly string[]).includes(normalized);
}

export function isSectorAssignmentRoleCode(
  roleCode: string | null | undefined,
): roleCode is SectorAssignmentRoleCode {
  const normalized = normalizePortalRole(roleCode);
  if (!normalized) return false;
  return (SECTOR_ASSIGNMENT_ROLE_CODES as readonly string[]).includes(normalized);
}

export function isCommandCenterSingletonRank(
  rank: string | null | undefined,
): rank is (typeof MD_PORTAL_COMMAND_CENTER_SINGLETON_RANKS)[number] {
  const normalized = normalizePortalRole(rank);
  if (!normalized) return false;
  return (MD_PORTAL_COMMAND_CENTER_SINGLETON_RANKS as readonly string[]).includes(
    normalized,
  );
}

export function portalSecurityPolicyForRank(
  rank: string | null | undefined,
): PortalSecurityPolicy {
  const normalized = normalizePortalRole(rank);
  return {
    rank: normalized,
    loginPortal: resolveLoginPortalForCommandCenterRank(normalized),
    passwordMinLength: passwordMinLengthForCommandCenterRank(normalized),
    otpDigits: HO_PORTAL_OTP_LENGTH,
    otpChannel: otpChannelForCommandCenterRank(normalized),
    otpLifetimeMinutes: otpExpiresMinutesForRank(normalized),
    recoveryEmailRequired: requiresExecutiveRecoveryEmail(normalized),
    twoFactorRequired: true,
    selfServiceMdRequestCode: isExecutiveRank(normalized),
  };
}

export function formatPasswordPolicyLabel(policy: PortalSecurityPolicy): string {
  return `${policy.passwordMinLength}+ chars`;
}

export function formatOtpChannelLabel(policy: PortalSecurityPolicy): string {
  const suffix = `${policy.otpLifetimeMinutes}m`;
  if (policy.otpChannel === 'email') {
    return `Email · ${suffix}`;
  }
  return `HR desk · ${suffix}`;
}

export function formatTwoFactorPolicyLabel(
  policy: PortalSecurityPolicy,
  enabled: boolean,
): string {
  return `TOTP required · ${enabled ? 'On' : 'Off'}`;
}

export function filterStaffForCommandCenter<T extends StaffCommandCenterRow>(
  staff: T[],
): T[] {
  return staff.filter((person) => isMdPortalCommandCenterRank(person.rank));
}

export function sortStaffForCommandCenter<T extends StaffCommandCenterRow>(
  staff: T[],
): T[] {
  return [...staff].sort((a, b) => {
    const rankA = normalizePortalRole(a.rank);
    const rankB = normalizePortalRole(b.rank);
    const orderA =
      rankA && isMdPortalCommandCenterRank(rankA)
        ? COMMAND_CENTER_RANK_ORDER[rankA]
        : 99;
    const orderB =
      rankB && isMdPortalCommandCenterRank(rankB)
        ? COMMAND_CENTER_RANK_ORDER[rankB]
        : 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' });
  });
}

export function filterAndSortStaffForCommandCenter<T extends StaffCommandCenterRow>(
  staff: T[],
): T[] {
  return sortStaffForCommandCenter(filterStaffForCommandCenter(staff));
}
