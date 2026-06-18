export type GuardPayrollCohort =
  | 'guard_commercial'
  | 'guard_other_bank'
  | 'guard_no_bank';

export type StaffPayrollKind = 'ho' | 'sm' | 'cafe';

export type StaffNoBankCohort = 'ho_no_bank' | 'sm_no_bank' | 'cafe_no_bank';

export type PinnedPayrollGroupKind = StaffPayrollKind | StaffNoBankCohort | GuardPayrollCohort;

export const PINNED_PAYROLL_GROUP_ORDER: PinnedPayrollGroupKind[] = [
  'ho',
  'sm',
  'cafe',
  'ho_no_bank',
  'sm_no_bank',
  'cafe_no_bank',
  'guard_commercial',
  'guard_other_bank',
  'guard_no_bank',
];

export const STAFF_NO_BANK_COHORT_ORDER: StaffNoBankCohort[] = [
  'ho_no_bank',
  'sm_no_bank',
  'cafe_no_bank',
];

export const STAFF_NO_BANK_SITE_IDS: Record<StaffNoBankCohort, string> = {
  ho_no_bank: 'group-cvs-no-bank',
  sm_no_bank: 'group-cvs-sm-no-bank',
  cafe_no_bank: 'group-cafe-no-bank',
};

export const STAFF_NO_BANK_META: Record<StaffNoBankCohort, { name: string; location: string }> =
  {
    ho_no_bank: {
      name: 'CVS — No Bank Account',
      location: 'Head office employees · no bank on file',
    },
    sm_no_bank: {
      name: 'SM CVS — No Bank Account',
      location: 'Sector managers · no bank on file',
    },
    cafe_no_bank: {
      name: 'Café — No Bank Account',
      location: 'Café staff · no bank on file',
    },
  };

export const PINNED_HO_SITE_ID = 'group-cvs';
export const PINNED_SM_SITE_ID = 'group-cvs-sm';
export const PINNED_CAFE_SITE_ID = 'group-cafe';

export const GUARD_COHORT_ORDER: GuardPayrollCohort[] = [
  'guard_commercial',
  'guard_other_bank',
  'guard_no_bank',
];

export const GUARD_COHORT_SITE_IDS: Record<GuardPayrollCohort, string> = {
  guard_commercial: 'group-guard-commercial',
  guard_other_bank: 'group-guard-other-bank',
  guard_no_bank: 'group-guard-no-bank',
};

export const GUARD_COHORT_META: Record<
  GuardPayrollCohort,
  { name: string; location: string }
> = {
  guard_commercial: {
    name: 'Guards — Commercial Bank',
    location: 'Commercial Bank accounts · all branches',
  },
  guard_other_bank: {
    name: 'Guards — Other Banks',
    location: 'Non-Commercial Bank accounts · all branches',
  },
  guard_no_bank: {
    name: 'Guards — No Bank Account',
    location: 'No bank account on file · all branches',
  },
};

export function isCommercialBank(bankName: string | null | undefined): boolean {
  const bank = (bankName ?? '').trim().toUpperCase();
  return bank.includes('COMMERCIAL') || bank === 'COMBANK';
}

export function hasBankOnFile(bankName: string | null | undefined): boolean {
  const bank = (bankName ?? '').trim();
  return bank.length > 0 && bank.toUpperCase() !== 'UNKNOWN';
}

export function classifyGuardCohort(
  _empNo: string,
  bankName: string | null | undefined,
): GuardPayrollCohort {
  if (!hasBankOnFile(bankName)) return 'guard_no_bank';
  if (isCommercialBank(bankName)) return 'guard_commercial';
  return 'guard_other_bank';
}

export function isGuardPayrollCohort(
  payrollGroup: string | undefined,
): payrollGroup is GuardPayrollCohort {
  return (
    payrollGroup === 'guard_commercial' ||
    payrollGroup === 'guard_other_bank' ||
    payrollGroup === 'guard_no_bank'
  );
}

export function staffNoBankCohortForKind(kind: StaffPayrollKind): StaffNoBankCohort {
  return `${kind}_no_bank` as StaffNoBankCohort;
}

export function isStaffNoBankCohort(
  payrollGroup: string | undefined,
): payrollGroup is StaffNoBankCohort {
  return (
    payrollGroup === 'ho_no_bank' ||
    payrollGroup === 'sm_no_bank' ||
    payrollGroup === 'cafe_no_bank'
  );
}

export function isCashPayrollGroup(payrollGroup: string | undefined): boolean {
  return payrollGroup === 'guard_no_bank' || isStaffNoBankCohort(payrollGroup);
}

/** CVS payroll ledger / advance desk section (HO + SM, including no-bank cohorts). */
export function isCvsSectionPayrollGroup(payrollGroup: string | undefined): boolean {
  return (
    payrollGroup === 'ho' ||
    payrollGroup === 'sm' ||
    payrollGroup === 'ho_no_bank' ||
    payrollGroup === 'sm_no_bank'
  );
}

/** Pinned rows that expose Lock / Send to MD and bank export after MD approval. */
export function hasPinnedPayrollWorkflow(payrollGroup: string | undefined): boolean {
  return (
    payrollGroup === 'ho' ||
    payrollGroup === 'sm' ||
    payrollGroup === 'cafe' ||
    payrollGroup === 'guard_commercial' ||
    payrollGroup === 'guard_other_bank'
  );
}

export function usesCohortBankDownload(payrollGroup: string | undefined): boolean {
  return payrollGroup === 'guard_commercial' || payrollGroup === 'guard_other_bank';
}

export function bankExportLabel(payrollGroup: string | undefined): string {
  if (payrollGroup === 'guard_other_bank') return 'Other Banks transfer';
  if (payrollGroup === 'guard_commercial') return 'Commercial Bank transfer';
  return 'Commercial Bank transfer';
}
