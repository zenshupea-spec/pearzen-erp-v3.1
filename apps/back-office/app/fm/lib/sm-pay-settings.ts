/** Mirrors FM Settings → Global SM compensation (demo / May 2026). */
export type SmPayMode = 'FIXED_ONLY' | 'PER_VISIT_ONLY' | 'FIXED_AND_PER_VISIT';

export const FM_SM_COMPENSATION = {
  payMode: 'PER_VISIT_ONLY' as SmPayMode,
  fixedBasicLkr: 55_000,
  perVisitRateLkr: 2_500,
} as const;

export function smPayModeLabel(mode: SmPayMode): string {
  switch (mode) {
    case 'FIXED_ONLY':
      return 'Fixed basic only';
    case 'PER_VISIT_ONLY':
      return 'Per-visit only';
    case 'FIXED_AND_PER_VISIT':
      return 'Fixed basic + per-visit';
  }
}

export function computeSmGrossLkr(
  visitsCompleted: number,
  mode: SmPayMode = FM_SM_COMPENSATION.payMode,
  perVisitRate = FM_SM_COMPENSATION.perVisitRateLkr,
  fixedBasic = FM_SM_COMPENSATION.fixedBasicLkr,
): { visitPayLkr: number; fixedBasicLkr: number; totalGrossLkr: number } {
  const visitPayLkr =
    mode === 'FIXED_ONLY' ? 0 : visitsCompleted * perVisitRate;
  const fixedBasicLkr = mode === 'PER_VISIT_ONLY' ? 0 : fixedBasic;
  return {
    visitPayLkr,
    fixedBasicLkr,
    totalGrossLkr: visitPayLkr + fixedBasicLkr,
  };
}
