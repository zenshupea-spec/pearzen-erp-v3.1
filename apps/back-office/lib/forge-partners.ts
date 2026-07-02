/** Forge independent service partner layer — types aligned with partner migrations. */

export const FORGE_PARTNER_DEAL_TYPES = [
  'saas_erp',
  'wfm_tool',
  'custom_software',
  'website_build',
] as const;

export type ForgePartnerDealType = (typeof FORGE_PARTNER_DEAL_TYPES)[number];

export const FORGE_PARTNER_PORTFOLIO_STATUSES = ['active', 'churned'] as const;

export type ForgePartnerPortfolioStatus = (typeof FORGE_PARTNER_PORTFOLIO_STATUSES)[number];

export const FORGE_PAYOUT_SOURCE_TYPES = ['saas_platform', 'forge_product'] as const;

export type ForgePayoutSourceType = (typeof FORGE_PAYOUT_SOURCE_TYPES)[number];

export const DEFAULT_FORGE_PAYOUT_RULES = {
  monthOneClientLkr: 10000,
  monthTwoPlusClientLkr: 5000,
  monthOnePartnerLkr: 5000,
  monthOnePearzenLkr: 5000,
  monthTwoPlusPartnerLkr: 1000,
  monthTwoPlusPearzenLkr: 4000,
} as const;

export type ForgePayoutRules = {
  monthOneClientLkr: number;
  monthTwoPlusClientLkr: number;
  monthOnePartnerLkr: number;
  monthOnePearzenLkr: number;
  monthTwoPlusPartnerLkr: number;
  monthTwoPlusPearzenLkr: number;
};

export type ForgeServicePartner = {
  id: string;
  userId: string | null;
  displayName: string;
  email: string;
  referralCode: string;
  isActive: boolean;
  createdAt: string;
};

export type ForgePartnerPortfolio = {
  id: string;
  partnerId: string;
  companyId: string;
  dealType: ForgePartnerDealType;
  referralCode: string | null;
  closedAt: string;
  status: ForgePartnerPortfolioStatus;
  notes: string | null;
  createdAt: string;
};

export type ForgePayoutLedgerEntry = {
  id: string;
  partnerId: string;
  portfolioId: string | null;
  billingMonth: string;
  partnerShareLkr: number;
  pearzenShareLkr: number;
  sourceType: ForgePayoutSourceType;
  sourceInvoiceId: string | null;
  notes: string | null;
  createdAt: string;
};

export function isForgePartnerDealType(value: string): value is ForgePartnerDealType {
  return (FORGE_PARTNER_DEAL_TYPES as readonly string[]).includes(value);
}

export function partnerDealTypeLabel(dealType: ForgePartnerDealType): string {
  switch (dealType) {
    case 'saas_erp':
      return 'ERP subscription';
    case 'wfm_tool':
      return 'WFM tool';
    case 'custom_software':
      return 'Custom software';
    case 'website_build':
      return 'Website build';
    default:
      return dealType;
  }
}

export function payoutSourceTypeLabel(sourceType: ForgePayoutSourceType): string {
  switch (sourceType) {
    case 'saas_platform':
      return 'ERP subscription';
    case 'forge_product':
      return 'Commerce product';
    default:
      return sourceType;
  }
}
