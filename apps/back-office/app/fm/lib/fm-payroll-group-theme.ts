import {
  isGuardPayrollCohort,
  isStaffNoBankCohort,
  type GuardPayrollCohort,
  type PinnedPayrollGroupKind,
  type StaffNoBankCohort,
} from './guard-payroll-cohorts';

export type PayrollGroupTheme = {
  card: string;
  headerBg: string;
  headerHover: string;
  stripe: string;
  badge: string;
  chevronCollapsed: string;
  chevronExpanded: string;
  label: string;
};

export type AdvancePayrollSectionId = 'ho' | 'sm' | 'cafe' | 'guards';

export type AdvancePayrollSection = {
  id: AdvancePayrollSectionId;
  title: string;
  subtitle: string;
  border: string;
  bg: string;
  titleColor: string;
  subtitleColor: string;
  iconBg: string;
  matches: (payrollGroup: string | undefined) => boolean;
};

const INDIGO_THEME: PayrollGroupTheme = {
  card: 'border-indigo-200/80 ring-indigo-100/80',
  headerBg: 'bg-indigo-50/40',
  headerHover: 'hover:bg-indigo-50/70',
  stripe: 'border-l-indigo-500',
  badge: 'border-indigo-200 bg-indigo-100/90 text-indigo-800',
  chevronCollapsed: 'border-indigo-200/80 bg-indigo-50/80 text-indigo-600',
  chevronExpanded: 'border-indigo-300 bg-indigo-100 text-indigo-700',
  label: 'Head office',
};

const SKY_THEME: PayrollGroupTheme = {
  card: 'border-sky-200/80 ring-sky-100/80',
  headerBg: 'bg-sky-50/40',
  headerHover: 'hover:bg-sky-50/70',
  stripe: 'border-l-sky-500',
  badge: 'border-sky-200 bg-sky-100/90 text-sky-800',
  chevronCollapsed: 'border-sky-200/80 bg-sky-50/80 text-sky-600',
  chevronExpanded: 'border-sky-300 bg-sky-100 text-sky-700',
  label: 'Sector managers',
};

const VIOLET_THEME: PayrollGroupTheme = {
  card: 'border-violet-200/80 ring-violet-100/80',
  headerBg: 'bg-violet-50/40',
  headerHover: 'hover:bg-violet-50/70',
  stripe: 'border-l-violet-500',
  badge: 'border-violet-200 bg-violet-100/90 text-violet-800',
  chevronCollapsed: 'border-violet-200/80 bg-violet-50/80 text-violet-600',
  chevronExpanded: 'border-violet-300 bg-violet-100 text-violet-700',
  label: 'Café',
};

const EMERALD_THEME: PayrollGroupTheme = {
  card: 'border-emerald-200/80 ring-emerald-100/80',
  headerBg: 'bg-emerald-50/40',
  headerHover: 'hover:bg-emerald-50/70',
  stripe: 'border-l-emerald-500',
  badge: 'border-emerald-200 bg-emerald-100/90 text-emerald-800',
  chevronCollapsed: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-600',
  chevronExpanded: 'border-emerald-300 bg-emerald-100 text-emerald-700',
  label: 'Guards',
};

const SLATE_THEME: PayrollGroupTheme = {
  card: 'border-slate-200/80 ring-slate-100/80',
  headerBg: 'bg-slate-50/60',
  headerHover: 'hover:bg-slate-100/70',
  stripe: 'border-l-slate-400',
  badge: 'border-slate-200 bg-slate-100 text-slate-700',
  chevronCollapsed: 'border-slate-200 bg-slate-100 text-slate-500',
  chevronExpanded: 'border-slate-300 bg-slate-200 text-slate-700',
  label: 'Payroll group',
};

function withCashAccent(base: PayrollGroupTheme, label: string): PayrollGroupTheme {
  return {
    ...base,
    stripe: 'border-l-amber-400',
    badge: 'border-amber-200 bg-amber-100/90 text-amber-900',
    chevronCollapsed: 'border-amber-200/80 bg-amber-50/80 text-amber-700',
    chevronExpanded: 'border-amber-300 bg-amber-100 text-amber-800',
    label,
  };
}

export function payrollGroupTheme(payrollGroup?: string): PayrollGroupTheme {
  if (payrollGroup === 'cafe') return VIOLET_THEME;
  if (payrollGroup === 'cafe_no_bank') return withCashAccent(VIOLET_THEME, 'Café · cash');
  if (payrollGroup === 'sm') return SKY_THEME;
  if (payrollGroup === 'sm_no_bank') return withCashAccent(SKY_THEME, 'SM · cash');
  if (payrollGroup === 'ho') return INDIGO_THEME;
  if (payrollGroup === 'ho_no_bank') return withCashAccent(INDIGO_THEME, 'CVS · cash');
  if (payrollGroup === 'guard_no_bank') {
    return withCashAccent(EMERALD_THEME, 'Guards · cash');
  }
  if (isGuardPayrollCohort(payrollGroup)) return EMERALD_THEME;
  if (isStaffNoBankCohort(payrollGroup)) return withCashAccent(SLATE_THEME, 'Cash pay');
  return SLATE_THEME;
}

export const ADVANCE_PAYROLL_SECTIONS: AdvancePayrollSection[] = [
  {
    id: 'ho',
    title: 'Head Office · CVS',
    subtitle: 'Bank payroll and no-bank cash cohort',
    border: 'border-indigo-200/70',
    bg: 'bg-indigo-50/30',
    titleColor: 'text-indigo-900',
    subtitleColor: 'text-indigo-700/80',
    iconBg: 'bg-indigo-100 text-indigo-700',
    matches: (pg) => pg === 'ho' || pg === 'ho_no_bank',
  },
  {
    id: 'sm',
    title: 'Sector Managers · SM CVS',
    subtitle: 'Visit-based pay · bank and cash cohorts',
    border: 'border-sky-200/70',
    bg: 'bg-sky-50/30',
    titleColor: 'text-sky-900',
    subtitleColor: 'text-sky-700/80',
    iconBg: 'bg-sky-100 text-sky-700',
    matches: (pg) => pg === 'sm' || pg === 'sm_no_bank',
  },
  {
    id: 'cafe',
    title: 'Café Operations',
    subtitle: 'Branch staff · bank and cash cohorts',
    border: 'border-violet-200/70',
    bg: 'bg-violet-50/30',
    titleColor: 'text-violet-900',
    subtitleColor: 'text-violet-700/80',
    iconBg: 'bg-violet-100 text-violet-700',
    matches: (pg) => pg === 'cafe' || pg === 'cafe_no_bank',
  },
  {
    id: 'guards',
    title: 'Guards',
    subtitle: 'Commercial · other banks · no-bank cash',
    border: 'border-emerald-200/70',
    bg: 'bg-emerald-50/30',
    titleColor: 'text-emerald-900',
    subtitleColor: 'text-emerald-700/80',
    iconBg: 'bg-emerald-100 text-emerald-700',
    matches: (pg) => isGuardPayrollCohort(pg),
  },
];

export function advanceSectionForGroup(
  payrollGroup: PinnedPayrollGroupKind | GuardPayrollCohort | StaffNoBankCohort | undefined,
): AdvancePayrollSection | undefined {
  return ADVANCE_PAYROLL_SECTIONS.find((section) => section.matches(payrollGroup));
}
