import { CVS_GUARD_OPS_ENABLED } from '../../../lib/cvs-workforce-phase';
import {
  GUARD_COHORT_META,
  GUARD_COHORT_ORDER,
  GUARD_COHORT_SITE_IDS,
  PINNED_CAFE_SITE_ID,
  PINNED_HO_SITE_ID,
  PINNED_SM_SITE_ID,
  STAFF_NO_BANK_COHORT_ORDER,
  STAFF_NO_BANK_META,
  STAFF_NO_BANK_SITE_IDS,
  type GuardPayrollCohort,
  type StaffNoBankCohort,
} from './guard-payroll-cohorts';

export type PinnedPayrollSiteShell = {
  id: string;
  name: string;
  location: string;
  clientBilled: number;
  payrollCost: number;
  payrollGroup?: 'ho' | 'cafe' | 'sm' | StaffNoBankCohort | GuardPayrollCohort;
  displayEmployeeCount?: number;
  employees: unknown[];
};

function emptyPinnedHoSite(): PinnedPayrollSiteShell {
  return {
    id: PINNED_HO_SITE_ID,
    name: 'CVS',
    location: 'Head office employees · all branches',
    clientBilled: 0,
    payrollCost: 0,
    payrollGroup: 'ho',
    displayEmployeeCount: 0,
    employees: [],
  };
}

function emptyPinnedSmSite(): PinnedPayrollSiteShell {
  return {
    id: PINNED_SM_SITE_ID,
    name: 'SM CVS',
    location: 'SM group · sector managers · visit-based pay',
    clientBilled: 0,
    payrollCost: 0,
    payrollGroup: 'sm',
    displayEmployeeCount: 0,
    employees: [],
  };
}

function emptyPinnedCafeSite(branchLabels: string[] = []): PinnedPayrollSiteShell {
  const branchHint =
    branchLabels.length > 0 ? branchLabels.join(' · ') : 'all branches';
  return {
    id: PINNED_CAFE_SITE_ID,
    name: 'Café',
    location: `Café operations · ${branchHint}`,
    clientBilled: 0,
    payrollCost: 0,
    payrollGroup: 'cafe',
    displayEmployeeCount: 0,
    employees: [],
  };
}

function emptyGuardCohortSite(cohort: GuardPayrollCohort): PinnedPayrollSiteShell {
  const meta = GUARD_COHORT_META[cohort];
  return {
    id: GUARD_COHORT_SITE_IDS[cohort],
    name: meta.name,
    location: meta.location,
    clientBilled: 0,
    payrollCost: 0,
    payrollGroup: cohort,
    displayEmployeeCount: 0,
    employees: [],
  };
}

function emptyStaffNoBankSite(cohort: StaffNoBankCohort): PinnedPayrollSiteShell {
  const meta = STAFF_NO_BANK_META[cohort];
  return {
    id: STAFF_NO_BANK_SITE_IDS[cohort],
    name: meta.name,
    location: meta.location,
    clientBilled: 0,
    payrollCost: 0,
    payrollGroup: cohort,
    displayEmployeeCount: 0,
    employees: [],
  };
}

/** Always return CVS, SM CVS, Café, staff no-bank cohorts, and guard bank cohort rows in display order. */
export function ensurePinnedPayrollSites<T extends PinnedPayrollSiteShell>(
  pinned: T[],
  cafeBranchLabels: string[] = [],
): T[] {
  const byId = new Map(pinned.map((site) => [site.id, site]));
  const cafeFallback = emptyPinnedCafeSite(cafeBranchLabels) as T;

  return [
    (byId.get(PINNED_HO_SITE_ID) ?? emptyPinnedHoSite()) as T,
    (byId.get(PINNED_SM_SITE_ID) ?? emptyPinnedSmSite()) as T,
    (byId.get(PINNED_CAFE_SITE_ID) ?? cafeFallback) as T,
    ...STAFF_NO_BANK_COHORT_ORDER.map(
      (cohort) =>
        (byId.get(STAFF_NO_BANK_SITE_IDS[cohort]) ?? emptyStaffNoBankSite(cohort)) as T,
    ),
    ...(CVS_GUARD_OPS_ENABLED
      ? GUARD_COHORT_ORDER.map(
          (cohort) =>
            (byId.get(GUARD_COHORT_SITE_IDS[cohort]) ?? emptyGuardCohortSite(cohort)) as T,
        )
      : []),
  ];
}
