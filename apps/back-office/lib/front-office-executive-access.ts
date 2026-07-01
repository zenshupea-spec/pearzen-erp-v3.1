import type { CafeEmployeeRow } from './cafe-front-auth-shared';
import type { CafeShiftGate } from './cafe-front-shift';
import type { BackOfficeUserProfile } from './hr-portal-access';
import { isExecutiveRank } from './portal-role-utils';
import type { ShalomEmployeeRow } from './shalom-front-auth-shared';

/** MD/OD may open café and Shalom front office with their head-office session (no EPF re-login). */
export function canAccessFrontOfficeAsExecutive(
  profile: Pick<BackOfficeUserProfile, 'role'>,
): boolean {
  return isExecutiveRank(profile.role);
}

/** Read-only oversight session — portal UI unlocked without shift check-in. */
export function executiveCafeShiftGate(): CafeShiftGate {
  return {
    rosteredToday: false,
    checkedInToday: false,
    checkedOutToday: false,
    activeOnShift: false,
    portalAccessible: true,
    canAcceptOrders: false,
    shiftType: null,
    checkinAt: null,
    checkoutAt: null,
    cafeOpenEnd: '23:59',
    portalGraceEnd: '23:59',
  };
}

export function cafeEmployeeFromExecutiveProfile(
  profile: Pick<BackOfficeUserProfile, 'role' | 'full_name' | 'employeeId'>,
  companyId?: string | null,
): CafeEmployeeRow {
  return {
    id: profile.employeeId ?? 'executive',
    full_name: profile.full_name,
    emp_number: null,
    epf_no: null,
    epf_num: null,
    status: 'ACTIVE',
    group: 'EXECUTIVE',
    rank: profile.role,
    site: null,
    company_id: companyId ?? null,
  };
}

export function shalomEmployeeFromExecutiveProfile(
  profile: Pick<BackOfficeUserProfile, 'role' | 'full_name' | 'employeeId'>,
  companyId?: string | null,
): ShalomEmployeeRow {
  return {
    id: profile.employeeId ?? 'executive',
    full_name: profile.full_name,
    emp_number: null,
    epf_no: null,
    epf_num: null,
    status: 'ACTIVE',
    group: 'EXECUTIVE',
    rank: profile.role,
    site: null,
    company_id: companyId ?? null,
  };
}
