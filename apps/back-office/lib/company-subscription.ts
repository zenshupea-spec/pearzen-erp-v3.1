/** Tenant ERP subscription lifecycle — synced with companies.is_active / is_suspended. */

export const COMPANY_SUBSCRIPTION_STATUSES = [
  'trial',
  'active',
  'past_due',
  'suspended',
] as const;

export type CompanySubscriptionStatus = (typeof COMPANY_SUBSCRIPTION_STATUSES)[number];

export function isCompanySubscriptionStatus(value: string): value is CompanySubscriptionStatus {
  return (COMPANY_SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export const SUBSCRIPTION_STATUS_LABELS: Record<CompanySubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  suspended: 'Suspended',
};

export const SUBSCRIPTION_STATUS_DESCRIPTIONS: Record<CompanySubscriptionStatus, string> = {
  trial: 'New tenant — full access while onboarding.',
  active: 'Subscription current — portals online.',
  past_due: 'Unpaid platform invoice due or overdue — FM notice shown; portals stay online.',
  suspended: 'Kill-switch engaged — tenant portals blocked.',
};

export function subscriptionStatusBadgeClass(status: CompanySubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'trial':
      return 'bg-sky-500/10 text-sky-300 border-sky-500/20';
    case 'past_due':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    case 'suspended':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

export function subscriptionStatusFromFlags(input: {
  isActive?: boolean | null;
  isSuspended?: boolean | null;
}): CompanySubscriptionStatus {
  if (input.isSuspended || input.isActive === false) return 'suspended';
  return 'active';
}
