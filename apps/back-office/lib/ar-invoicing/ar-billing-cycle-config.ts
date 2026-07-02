export type ArBillingCycle = {
  invoiceDispatchDay: number;
  collectionWarningDay: number;
  payrollTargetDay: number;
};

export const AR_BILLING_CYCLE_DEFAULTS: ArBillingCycle = {
  invoiceDispatchDay: 1,
  collectionWarningDay: 6,
  payrollTargetDay: 10,
};

function clampDay(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(28, Math.max(1, Math.round(n)));
}

export function sanitizeArBillingCycle(raw: Partial<ArBillingCycle> | null | undefined): ArBillingCycle {
  return {
    invoiceDispatchDay: clampDay(raw?.invoiceDispatchDay, AR_BILLING_CYCLE_DEFAULTS.invoiceDispatchDay),
    collectionWarningDay: clampDay(
      raw?.collectionWarningDay,
      AR_BILLING_CYCLE_DEFAULTS.collectionWarningDay,
    ),
    payrollTargetDay: clampDay(raw?.payrollTargetDay, AR_BILLING_CYCLE_DEFAULTS.payrollTargetDay),
  };
}
