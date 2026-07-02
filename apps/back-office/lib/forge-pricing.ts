/** Shared helpers for Forge editable pricing (catalog, payout rules, purchase overrides). */

export type ForgeCustomMonthlyMode = 'fixed' | 'per_employee';

export type ForgeCustomPricingDefaults = {
  preHandoverLkr: number;
  postHandoverLkr: number;
  monthlyFixedLkr: number;
  monthlyPerEmployeeLkr: number;
  monthlyMode: ForgeCustomMonthlyMode;
};

export type ForgeWfmPricingDefaults = {
  perEmployeeLkr: number;
};

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function readWfmPricingDefaults(metadata: Record<string, unknown>): ForgeWfmPricingDefaults {
  return {
    perEmployeeLkr: asNumber(metadata.per_employee_lkr, 1500),
  };
}

export function readCustomPricingDefaults(
  metadata: Record<string, unknown>,
): ForgeCustomPricingDefaults {
  const monthlyMode = asString(metadata.monthly_mode, 'fixed');
  return {
    preHandoverLkr: asNumber(metadata.pre_handover_lkr, 0),
    postHandoverLkr: asNumber(metadata.post_handover_lkr, 0),
    monthlyFixedLkr: asNumber(metadata.monthly_fixed_lkr, 0),
    monthlyPerEmployeeLkr: asNumber(metadata.monthly_per_employee_lkr, 0),
    monthlyMode: monthlyMode === 'per_employee' ? 'per_employee' : 'fixed',
  };
}

export function readWfmPerEmployeeOverride(
  purchaseMetadata: Record<string, unknown> | null | undefined,
  catalogDefaults: ForgeWfmPricingDefaults,
  billingPerEmployeeLkr?: number | null,
): number {
  if (purchaseMetadata?.per_employee_lkr != null) {
    return asNumber(purchaseMetadata.per_employee_lkr, catalogDefaults.perEmployeeLkr);
  }
  if (billingPerEmployeeLkr != null && billingPerEmployeeLkr > 0) {
    return billingPerEmployeeLkr;
  }
  return catalogDefaults.perEmployeeLkr;
}

export function readCustomPricingOverride(
  purchaseMetadata: Record<string, unknown> | null | undefined,
  catalogDefaults: ForgeCustomPricingDefaults,
): ForgeCustomPricingDefaults {
  if (!purchaseMetadata || Object.keys(purchaseMetadata).length === 0) {
    return catalogDefaults;
  }

  const monthlyMode = purchaseMetadata.monthly_mode
    ? asString(purchaseMetadata.monthly_mode, catalogDefaults.monthlyMode)
    : catalogDefaults.monthlyMode;

  return {
    preHandoverLkr:
      purchaseMetadata.pre_handover_lkr != null
        ? asNumber(purchaseMetadata.pre_handover_lkr, catalogDefaults.preHandoverLkr)
        : catalogDefaults.preHandoverLkr,
    postHandoverLkr:
      purchaseMetadata.post_handover_lkr != null
        ? asNumber(purchaseMetadata.post_handover_lkr, catalogDefaults.postHandoverLkr)
        : catalogDefaults.postHandoverLkr,
    monthlyFixedLkr:
      purchaseMetadata.monthly_fixed_lkr != null
        ? asNumber(purchaseMetadata.monthly_fixed_lkr, catalogDefaults.monthlyFixedLkr)
        : catalogDefaults.monthlyFixedLkr,
    monthlyPerEmployeeLkr:
      purchaseMetadata.monthly_per_employee_lkr != null
        ? asNumber(
            purchaseMetadata.monthly_per_employee_lkr,
            catalogDefaults.monthlyPerEmployeeLkr,
          )
        : catalogDefaults.monthlyPerEmployeeLkr,
    monthlyMode: monthlyMode === 'per_employee' ? 'per_employee' : 'fixed',
  };
}

export function customPricingToMetadata(
  pricing: ForgeCustomPricingDefaults,
): Record<string, unknown> {
  return {
    pre_handover_lkr: pricing.preHandoverLkr,
    post_handover_lkr: pricing.postHandoverLkr,
    monthly_fixed_lkr: pricing.monthlyFixedLkr,
    monthly_per_employee_lkr: pricing.monthlyPerEmployeeLkr,
    monthly_mode: pricing.monthlyMode,
  };
}
