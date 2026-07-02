export const ONBOARDING_BENCH_SITE = 'Unassigned (Bench)';

/** HO inductee — rank deferred to MD Portal Executive Roles (DB NOT NULL on employees.rank). */
export const HO_RANK_PENDING_ASSIGNMENT = 'TBD';

export function isHoRankPendingAssignment(
  rank: string | null | undefined,
): boolean {
  return (rank ?? '').trim().toUpperCase() === HO_RANK_PENDING_ASSIGNMENT;
}

export type OnboardingGuardSite = {
  id: string;
  siteName: string;
};
